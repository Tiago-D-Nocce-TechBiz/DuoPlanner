"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { obterSessao } from "@/lib/auth/sessao";
import { tabelaAusente } from "@/lib/auth/seguranca";
import { normalizarChavePix, TIPOS_CHAVE_PIX, type TipoChavePix } from "@/lib/pix/brcode";
import { criptografiaConfigurada } from "@/lib/seguranca/cripto-documentos";
import { getWorkspaceAtual, type Workspace } from "@/lib/supabase/workspace";
import {
  ACORDO_PADRAO,
  acordoDaLinha,
  type AcordoDivisao,
  type ContextoSincronizacao,
  type Membro,
  type PerfilProprio,
  type PixRecebimento,
} from "@/lib/sync/contexto";
import {
  ESQUEMAS_ATUALIZAR,
  ESQUEMAS_CRIAR,
  esquemaLote,
  esquemaOperacao,
  paraColunas,
  type OperacaoBruta,
} from "@/lib/sync/esquemas";
import { COLUNAS, DA_LINHA, TABELAS, type Recurso, type Registro } from "@/lib/sync/modelos";

/**
 * Camada de dados do casal no servidor (Server Actions + zod).
 *
 * - `obterContextoSincronizacao`: sessão, espaço, integrantes, acordo e se o
 *   banco já tem as tabelas novas (a tela entra em "modo local" se não).
 * - `sincronizarOperacoes`: aplica um lote da fila do aparelho. Cada operação
 *   é validada isoladamente; `user_id`/`workspace_id` saem da sessão; a RLS
 *   do Postgres é a segunda barreira. Operações repetidas (reenvio após queda
 *   de rede) são idempotentes.
 * - `salvarAcordoDivisao`, `salvarPerfil`: escrita direta (online).
 */

/* ------------------------------ contexto ------------------------------ */

export type RespostaContexto =
  | { ok: true; contexto: ContextoSincronizacao }
  | { ok: false; motivo: "nao_configurado" | "nao_autenticado"; mensagem: string };

function pixDaLinha(l: Record<string, unknown>): PixRecebimento | null {
  const tipo = l.tipo_chave_pix;
  const chave = l.chave_pix;
  if (typeof chave !== "string" || !chave || !(TIPOS_CHAVE_PIX as readonly unknown[]).includes(tipo)) return null;
  return {
    tipo: tipo as TipoChavePix,
    chave,
    nomeRecebedor: typeof l.nome_recebedor_pix === "string" ? l.nome_recebedor_pix : "",
    cidade: typeof l.cidade_pix === "string" ? l.cidade_pix : "",
  };
}

function perfilDaLinha(l: Record<string, unknown>): PerfilProprio {
  return {
    nome: typeof l.nome === "string" ? l.nome : "",
    cidadeBase: typeof l.cidade_base === "string" ? l.cidade_base : "",
    iataBase: typeof l.iata_base === "string" ? l.iata_base : "",
    pix: pixDaLinha(l),
    emailAlertas: l.email_alertas !== false,
    emailResumoSemanal: l.email_resumo_semanal !== false,
  };
}

const COLUNAS_PERFIL =
  "user_id, nome, cidade_base, iata_base, chave_pix, tipo_chave_pix, nome_recebedor_pix, cidade_pix, email_alertas, email_resumo_semanal";

export async function obterContextoSincronizacao(): Promise<RespostaContexto> {
  const auth = await obterSessao();
  if (!auth.ok) return auth;
  const { supabase, userId, email } = auth.sessao;

  const ws = await getWorkspaceAtual();
  const sonda = await supabase.from(TABELAS.despesas).select("id", { head: true, count: "exact" }).limit(1);
  const servidorPronto = !tabelaAusente(sonda.error);

  const [membrosLidos, acordoLido] = await Promise.all([
    ws
      ? supabase.from("workspace_members").select("user_id, papel").eq("workspace_id", ws.id)
      : Promise.resolve({ data: [] as { user_id: string; papel: string }[], error: null }),
    ws && servidorPronto
      ? supabase.from("acordos_divisao").select("*").eq("workspace_id", ws.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const integrantes = (membrosLidos.data ?? []) as { user_id: string; papel: string }[];
  const ids = [...new Set([userId, ...integrantes.map((m) => m.user_id)])];
  let perfis = new Map<string, Record<string, unknown>>();
  if (servidorPronto) {
    const { data } = await supabase.from("perfis").select(COLUNAS_PERFIL).in("user_id", ids);
    perfis = new Map((data ?? []).map((p) => [String(p.user_id), p as Record<string, unknown>]));
  }

  const nomePadrao = email ? email.split("@")[0] : "Você";
  const membros: Membro[] = integrantes.map((m) => {
    const perfil = perfis.get(m.user_id);
    const nome = (typeof perfil?.nome === "string" && perfil.nome.trim()) || (m.user_id === userId ? nomePadrao : "Seu par");
    return {
      userId: m.user_id,
      nome,
      papel: m.papel === "dono" ? "dono" : "parceiro",
      pix: perfil ? pixDaLinha(perfil) : null,
    };
  });

  const meuPerfil = perfis.get(userId);
  return {
    ok: true,
    contexto: {
      userId,
      email,
      workspace: ws ? { id: ws.id, nome: ws.nome, papel: ws.papel } : null,
      membros,
      perfil: meuPerfil ? perfilDaLinha(meuPerfil) : servidorPronto ? perfilDaLinha({ nome: nomePadrao }) : null,
      acordo: acordoLido.error ? ACORDO_PADRAO : acordoDaLinha(acordoLido.data as Record<string, unknown> | null),
      servidorPronto,
      criptografiaDocumentos: criptografiaConfigurada(),
    },
  };
}

/* ---------------------------- sincronização ---------------------------- */

export type ResultadoOperacao =
  | { opId: string; status: "aplicada"; registro?: Registro }
  | {
      opId: string;
      status: "rejeitada";
      motivo: "validacao" | "permissao" | "nao_encontrado" | "sem_espaco";
      mensagem: string;
    }
  | { opId: string; status: "adiada"; mensagem: string };

export type RespostaSincronizacao =
  | { ok: true; indisponivel: boolean; resultados: ResultadoOperacao[] }
  | { ok: false; motivo: "sessao" | "invalido"; mensagem: string };

/** Recursos que pertencem ao espaço (não existem sem um workspace). */
const DO_ESPACO: readonly Recurso[] = ["roteiro_dias", "roteiro_itens", "checklist"];

type Erro = { code?: string; message?: string } | null;

function classificarErro(opId: string, erro: NonNullable<Erro>): ResultadoOperacao | "indisponivel" {
  if (tabelaAusente(erro)) return "indisponivel";
  const code = erro.code ?? "";
  if (code === "42501") {
    return { opId, status: "rejeitada", motivo: "permissao", mensagem: "Sem permissão para alterar este item." };
  }
  if (["23514", "23503", "23502", "22P02", "22007", "22008", "22003", "22001"].includes(code)) {
    return { opId, status: "rejeitada", motivo: "validacao", mensagem: "Dados inválidos para salvar." };
  }
  console.error("[sincronizacao] erro temporário:", code, erro.message);
  return { opId, status: "adiada", mensagem: "O servidor não respondeu agora. Tentaremos de novo." };
}

async function aplicarOperacao(
  supabase: SupabaseClient,
  userId: string,
  ws: Workspace | null,
  op: OperacaoBruta
): Promise<ResultadoOperacao | "indisponivel"> {
  const tabela = TABELAS[op.recurso];
  const colunas = COLUNAS[op.recurso];
  const mapear = DA_LINHA[op.recurso] as (l: Record<string, unknown>) => Registro;

  if (op.tipo === "remover") {
    const { error } = await supabase.from(tabela).delete().eq("id", op.id);
    if (error) return classificarErro(op.opId, error);
    return { opId: op.opId, status: "aplicada" };
  }

  if (op.tipo === "atualizar") {
    const lido = ESQUEMAS_ATUALIZAR[op.recurso].safeParse(op.campos);
    if (!lido.success) {
      return { opId: op.opId, status: "rejeitada", motivo: "validacao", mensagem: lido.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const linha = paraColunas(op.recurso, lido.data as Record<string, unknown>);
    if (Object.keys(linha).length === 0) return { opId: op.opId, status: "aplicada" };
    const { data, error } = await supabase.from(tabela).update(linha).eq("id", op.id).select(colunas).maybeSingle();
    if (error) return classificarErro(op.opId, error);
    if (!data) {
      return { opId: op.opId, status: "rejeitada", motivo: "nao_encontrado", mensagem: "Este item foi removido ou não está mais compartilhado." };
    }
    return { opId: op.opId, status: "aplicada", registro: mapear(data as unknown as Record<string, unknown>) };
  }

  // criar
  const lido = ESQUEMAS_CRIAR[op.recurso].safeParse(op.registro);
  if (!lido.success) {
    return { opId: op.opId, status: "rejeitada", motivo: "validacao", mensagem: lido.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const campos = lido.data as Record<string, unknown>;
  if (DO_ESPACO.includes(op.recurso) && !ws) {
    return { opId: op.opId, status: "rejeitada", motivo: "sem_espaco", mensagem: "O espaço do casal ainda não está pronto." };
  }
  if (op.recurso === "despesas" && campos.escopo === "viagem_compartilhado" && !ws) {
    return { opId: op.opId, status: "rejeitada", motivo: "sem_espaco", mensagem: "Convide seu par para compartilhar gastos." };
  }

  const linha: Record<string, unknown> = { ...paraColunas(op.recurso, campos), workspace_id: ws?.id ?? null };
  if (op.recurso === "despesas" || op.recurso === "alertas") linha.user_id = userId;
  if (op.recurso === "despesas" && !linha.pago_por) linha.pago_por = userId;

  const { data, error } = await supabase.from(tabela).insert(linha).select(colunas).single();
  if (error) {
    // Reenvio da mesma criação (a resposta anterior se perdeu na rede): idempotente.
    if (error.code === "23505") {
      const { data: existente } = await supabase.from(tabela).select(colunas).eq("id", campos.id as string).maybeSingle();
      return {
        opId: op.opId,
        status: "aplicada",
        registro: existente ? mapear(existente as unknown as Record<string, unknown>) : undefined,
      };
    }
    return classificarErro(op.opId, error);
  }
  return { opId: op.opId, status: "aplicada", registro: mapear(data as unknown as Record<string, unknown>) };
}

export async function sincronizarOperacoes(entrada: unknown): Promise<RespostaSincronizacao> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, motivo: "sessao", mensagem: auth.mensagem };
  const { supabase, userId } = auth.sessao;

  const lote = esquemaLote.safeParse(entrada);
  if (!lote.success) return { ok: false, motivo: "invalido", mensagem: "Lote de sincronização inválido." };

  const ws = await getWorkspaceAtual();
  const resultados: ResultadoOperacao[] = [];
  for (const bruta of lote.data.ops) {
    const op = esquemaOperacao.safeParse(bruta);
    if (!op.success) {
      const opId = typeof (bruta as { opId?: unknown })?.opId === "string" ? (bruta as { opId: string }).opId : "?";
      resultados.push({ opId, status: "rejeitada", motivo: "validacao", mensagem: "Operação inválida." });
      continue;
    }
    const resultado = await aplicarOperacao(supabase, userId, ws, op.data);
    // Banco sem as tabelas: para aqui; o aparelho guarda o resto da fila.
    if (resultado === "indisponivel") return { ok: true, indisponivel: true, resultados };
    resultados.push(resultado);
  }
  return { ok: true, indisponivel: false, resultados };
}

/* -------------------------------- acordo -------------------------------- */

const esquemaAcordo = z
  .object({
    regra: z.enum(["igual", "proporcional", "fixo"]),
    percentualDono: z.number().min(0).max(100).transform((v) => Math.round(v * 100) / 100),
    valorFixo: z.number().min(0).max(10_000_000).transform((v) => Math.round(v * 100) / 100).nullable(),
    quemCobreFixo: z.enum(["dono", "parceiro"]),
  })
  .refine((a) => a.regra !== "fixo" || a.valorFixo !== null, {
    message: "Informe o valor fixo.",
    path: ["valorFixo"],
  });

export async function salvarAcordoDivisao(
  entrada: unknown
): Promise<{ ok: true; acordo: AcordoDivisao } | { ok: false; mensagem: string }> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, mensagem: auth.mensagem };
  const lido = esquemaAcordo.safeParse(entrada);
  if (!lido.success) return { ok: false, mensagem: lido.error.issues[0]?.message ?? "Regra inválida." };

  const ws = await getWorkspaceAtual();
  if (!ws) return { ok: false, mensagem: "O espaço do casal ainda não está pronto." };

  const { data, error } = await auth.sessao.supabase
    .from("acordos_divisao")
    .upsert(
      {
        workspace_id: ws.id,
        regra: lido.data.regra,
        percentual_dono: lido.data.regra === "proporcional" ? lido.data.percentualDono : 50,
        valor_fixo: lido.data.regra === "fixo" ? lido.data.valorFixo : null,
        quem_cobre_fixo: lido.data.quemCobreFixo,
      },
      { onConflict: "workspace_id" }
    )
    .select("*")
    .single();
  if (error) {
    if (tabelaAusente(error)) return { ok: false, mensagem: "O banco ainda não foi atualizado para salvar o acordo." };
    console.error("[acordo] falha ao salvar:", error.message);
    return { ok: false, mensagem: "Não foi possível salvar a regra agora." };
  }
  return { ok: true, acordo: acordoDaLinha(data as Record<string, unknown>) };
}

/* -------------------------------- perfil -------------------------------- */

const esquemaPerfil = z.object({
  nome: z.string().trim().min(1, "Informe seu nome.").max(80),
  cidadeBase: z.string().trim().max(80),
  iataBase: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z]{3}$/.test(v), "Use o código de 3 letras do aeroporto (ex.: CNF)."),
  pix: z
    .object({
      tipo: z.enum(TIPOS_CHAVE_PIX as [TipoChavePix, ...TipoChavePix[]]),
      chave: z.string().trim().min(1, "Informe a chave Pix.").max(120),
      nomeRecebedor: z.string().trim().min(1, "Informe o nome de quem recebe.").max(25, "Nome do recebedor: até 25 letras."),
      cidade: z.string().trim().min(1, "Informe a cidade.").max(15, "Cidade: até 15 letras."),
    })
    .nullable(),
  emailAlertas: z.boolean(),
  emailResumoSemanal: z.boolean(),
});

export async function salvarPerfil(
  entrada: unknown
): Promise<{ ok: true; perfil: PerfilProprio } | { ok: false; mensagem: string }> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, mensagem: auth.mensagem };
  const lido = esquemaPerfil.safeParse(entrada);
  if (!lido.success) return { ok: false, mensagem: lido.error.issues[0]?.message ?? "Dados inválidos." };

  let pix: PixRecebimento | null = null;
  if (lido.data.pix) {
    const chave = normalizarChavePix(lido.data.pix.tipo, lido.data.pix.chave);
    if (!chave.ok) return { ok: false, mensagem: chave.erro };
    pix = { ...lido.data.pix, chave: chave.chave };
  }

  const { data, error } = await auth.sessao.supabase
    .from("perfis")
    .upsert(
      {
        user_id: auth.sessao.userId,
        nome: lido.data.nome,
        cidade_base: lido.data.cidadeBase || null,
        iata_base: lido.data.iataBase || null,
        tipo_chave_pix: pix?.tipo ?? null,
        chave_pix: pix?.chave ?? null,
        nome_recebedor_pix: pix?.nomeRecebedor ?? null,
        cidade_pix: pix?.cidade ?? null,
        email_alertas: lido.data.emailAlertas,
        email_resumo_semanal: lido.data.emailResumoSemanal,
      },
      { onConflict: "user_id" }
    )
    .select(COLUNAS_PERFIL)
    .single();
  if (error) {
    if (tabelaAusente(error)) return { ok: false, mensagem: "O banco ainda não foi atualizado para salvar o perfil." };
    console.error("[perfil] falha ao salvar:", error.message);
    return { ok: false, mensagem: "Não foi possível salvar o perfil agora." };
  }
  return { ok: true, perfil: perfilDaLinha(data as Record<string, unknown>) };
}
