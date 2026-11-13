"use server";

import { z } from "zod";
import { ErroAcao, withAuthAction } from "@/lib/acoes/com-sessao";
import { tabelaAusente } from "@/lib/auth/seguranca";
import { integracaoAtiva } from "@/lib/env";
import { roundMoney } from "@/lib/finance/money";
import { normalizarChavePix, TIPOS_CHAVE_PIX, type TipoChavePix } from "@/lib/pix/brcode";
import { getWorkspaceAtual } from "@/lib/supabase/workspace";
import { aplicarLote, type ResultadoOperacao } from "@/lib/sync/aplicar-operacao";
import {
  acordoDaLinha,
  COLUNAS_ACORDO,
  type AcordoDivisao,
  type ContextoSincronizacao,
  type Membro,
  type PerfilProprio,
  type PixRecebimento,
} from "@/lib/sync/contexto";
import { esquemaLote, esquemaOperacao } from "@/lib/sync/esquemas";
import { bancoPronto } from "@/lib/sync/sonda-banco";

/**
 * Camada de dados do casal no servidor (Server Actions + zod), todas pelo
 * envoltório `withAuthAction` (sessão via getClaims, resultado padronizado).
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

export const obterContextoSincronizacao = withAuthAction(
  "obterContextoSincronizacao",
  async ({ sessao }): Promise<ContextoSincronizacao> => {
    const { supabase, userId, email } = sessao;

    // Uma rodada só (eram três em sequência, a cada abertura do painel):
    // integrantes, acordos e perfis vêm de TODOS os espaços da pessoa, que a
    // RLS já limita ao que é dela ou do par, e o espaço ativo é escolhido
    // aqui. Sem as tabelas novas, as duas últimas consultas só dão erro e
    // são ignoradas (servidorPronto = false).
    const [ws, servidorPronto, membrosLidos, acordosLidos, perfisLidos] = await Promise.all([
      getWorkspaceAtual(sessao),
      bancoPronto(supabase),
      supabase.from("workspace_members").select("workspace_id, user_id, papel"),
      supabase.from("acordos_divisao").select(COLUNAS_ACORDO),
      supabase.from("perfis").select(COLUNAS_PERFIL),
    ]);

    const integrantes = ws
      ? ((membrosLidos.data ?? []) as { workspace_id: string; user_id: string; papel: string }[]).filter(
          (m) => m.workspace_id === ws.id
        )
      : [];
    const ids = new Set([userId, ...integrantes.map((m) => m.user_id)]);
    const perfis = new Map<string, Record<string, unknown>>();
    if (servidorPronto && !perfisLidos.error) {
      for (const p of (perfisLidos.data ?? []) as Record<string, unknown>[]) {
        if (ids.has(String(p.user_id))) perfis.set(String(p.user_id), p);
      }
    }
    const acordoDoEspaco =
      ws && servidorPronto && !acordosLidos.error
        ? ((acordosLidos.data ?? []) as Record<string, unknown>[]).find((a) => a.workspace_id === ws.id) ?? null
        : null;

    const nomePadrao = email ? email.split("@")[0] : "Você";
    const membros: Membro[] = integrantes.map((m) => {
      const perfil = perfis.get(m.user_id);
      const nome =
        (typeof perfil?.nome === "string" && perfil.nome.trim()) || (m.user_id === userId ? nomePadrao : "Seu par");
      return {
        userId: m.user_id,
        nome,
        papel: m.papel === "dono" ? "dono" : "parceiro",
        pix: perfil ? pixDaLinha(perfil) : null,
      };
    });

    const meuPerfil = perfis.get(userId);
    return {
      userId,
      email,
      workspace: ws ? { id: ws.id, nome: ws.nome, papel: ws.papel } : null,
      membros,
      perfil: meuPerfil ? perfilDaLinha(meuPerfil) : servidorPronto ? perfilDaLinha({ nome: nomePadrao }) : null,
      acordo: acordoDaLinha(acordoDoEspaco),
      servidorPronto,
      criptografiaDocumentos: integracaoAtiva("criptografiaDocumentos"),
      iaAtiva: integracaoAtiva("ia"),
    };
  }
);

/* ---------------------------- sincronização ---------------------------- */

export type { ResultadoOperacao };

export interface RespostaLote {
  /** Banco sem as tabelas/colunas desta versão: o aparelho entra em modo local. */
  indisponivel: boolean;
  resultados: ResultadoOperacao[];
}

export const sincronizarOperacoes = withAuthAction(
  "sincronizarOperacoes",
  esquemaLote,
  async (lote, { sessao }): Promise<RespostaLote> => {
    const ws = await getWorkspaceAtual(sessao);
    const invalidas: ResultadoOperacao[] = [];
    const validas = [];
    for (const bruta of lote.ops) {
      const op = esquemaOperacao.safeParse(bruta);
      if (op.success) {
        validas.push(op.data);
        continue;
      }
      const opId = typeof (bruta as { opId?: unknown })?.opId === "string" ? (bruta as { opId: string }).opId : "?";
      invalidas.push({ opId, status: "rejeitada", motivo: "validacao", mensagem: "Operação inválida." });
    }
    // Criações e remoções seguidas do mesmo recurso vão numa gravação só (uma
    // fatura importada eram dezenas de INSERTs em sequência). Banco sem as
    // tabelas: para; o aparelho guarda o resto da fila.
    const lido = await aplicarLote(sessao.supabase, sessao.userId, ws, validas);
    return { indisponivel: lido.indisponivel, resultados: [...invalidas, ...lido.resultados] };
  }
);

/* -------------------------------- acordo -------------------------------- */

const esquemaAcordo = z
  .object({
    regra: z.enum(["igual", "proporcional", "fixo"]),
    percentualDono: z.number().min(0).max(100).transform((v) => Math.round(v * 100) / 100),
    valorFixo: z.number().min(0).max(10_000_000).transform(roundMoney).nullable(),
    quemCobreFixo: z.enum(["dono", "parceiro"]),
  })
  .refine((a) => a.regra !== "fixo" || a.valorFixo !== null, {
    message: "Informe o valor fixo.",
    path: ["valorFixo"],
  });

export const salvarAcordoDivisao = withAuthAction(
  "salvarAcordoDivisao",
  esquemaAcordo,
  async (acordo, { sessao }): Promise<AcordoDivisao> => {
    const ws = await getWorkspaceAtual(sessao);
    if (!ws) throw new ErroAcao("CONFLITO", "O espaço do casal ainda não está pronto.");

    const { data, error } = await sessao.supabase
      .from("acordos_divisao")
      .upsert(
        {
          workspace_id: ws.id,
          regra: acordo.regra,
          percentual_dono: acordo.regra === "proporcional" ? acordo.percentualDono : 50,
          valor_fixo: acordo.regra === "fixo" ? acordo.valorFixo : null,
          quem_cobre_fixo: acordo.quemCobreFixo,
        },
        { onConflict: "workspace_id" }
      )
      .select(COLUNAS_ACORDO)
      .single();
    if (error) {
      if (tabelaAusente(error)) throw new ErroAcao("NAO_CONFIGURADO", "O banco ainda não foi atualizado para salvar o acordo.");
      console.error("[acordo] falha ao salvar:", error.message);
      throw new ErroAcao("INDISPONIVEL", "Não foi possível salvar a regra agora.");
    }
    return acordoDaLinha(data as Record<string, unknown>);
  }
);

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

export const salvarPerfil = withAuthAction(
  "salvarPerfil",
  esquemaPerfil,
  async (perfil, { sessao }): Promise<PerfilProprio> => {
    let pix: PixRecebimento | null = null;
    if (perfil.pix) {
      const chave = normalizarChavePix(perfil.pix.tipo, perfil.pix.chave);
      if (!chave.ok) throw new ErroAcao("ENTRADA_INVALIDA", chave.erro);
      pix = { ...perfil.pix, chave: chave.chave };
    }

    const { data, error } = await sessao.supabase
      .from("perfis")
      .upsert(
        {
          user_id: sessao.userId,
          nome: perfil.nome,
          cidade_base: perfil.cidadeBase || null,
          iata_base: perfil.iataBase || null,
          tipo_chave_pix: pix?.tipo ?? null,
          chave_pix: pix?.chave ?? null,
          nome_recebedor_pix: pix?.nomeRecebedor ?? null,
          cidade_pix: pix?.cidade ?? null,
          email_alertas: perfil.emailAlertas,
          email_resumo_semanal: perfil.emailResumoSemanal,
        },
        { onConflict: "user_id" }
      )
      .select(COLUNAS_PERFIL)
      .single();
    if (error) {
      if (tabelaAusente(error)) throw new ErroAcao("NAO_CONFIGURADO", "O banco ainda não foi atualizado para salvar o perfil.");
      console.error("[perfil] falha ao salvar:", error.message);
      throw new ErroAcao("INDISPONIVEL", "Não foi possível salvar o perfil agora.");
    }
    return perfilDaLinha(data as Record<string, unknown>);
  }
);
