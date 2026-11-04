"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { obterSessao } from "@/lib/auth/sessao";
import { tabelaAusente } from "@/lib/auth/seguranca";
import { documentoDaLinha, finalDoNumero, TIPOS_DOCUMENTO, type DocumentoVisivel } from "@/lib/documentos/modelo";
import { cifrarNumeroDocumento, decifrarNumeroDocumento } from "@/lib/seguranca/cripto-documentos";
import { consumirCota } from "@/lib/seguranca/cotas";
import { getWorkspaceAtual } from "@/lib/supabase/workspace";

/**
 * Cofre de Documentos — tudo pelo servidor.
 *
 * O número (passaporte, RG...) é cifrado AQUI com AES-256-GCM antes de ir ao
 * banco; o navegador só recebe os 4 últimos caracteres. "Revelar" decifra sob
 * demanda, com sessão e cota. Sem a chave configurada no servidor, guardamos
 * só os 4 finais e avisamos (fail-closed: nunca texto puro).
 *
 * Documentos não passam pela fila offline do aparelho, de propósito: ela fica
 * no localStorage e o número completo não pode ficar lá.
 */

const COLUNAS_VISIVEIS =
  "id, user_id, tipo, titular, numero_final, numero_cifrado, validade, observacao, escopo, atualizado_em";

export type ResultadoLista =
  | { ok: true; documentos: DocumentoVisivel[] }
  | { ok: false; indisponivel: boolean; mensagem: string };

export async function listarDocumentos(): Promise<ResultadoLista> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, indisponivel: false, mensagem: auth.mensagem };
  const ws = await getWorkspaceAtual();
  const { userId, supabase } = auth.sessao;

  const consulta = supabase
    .from("documentos_viagem")
    .select(COLUNAS_VISIVEIS)
    .order("atualizado_em", { ascending: false })
    .limit(200);
  const { data, error } = await (ws
    ? consulta.or(`user_id.eq.${userId},and(workspace_id.eq.${ws.id},escopo.eq.viagem_compartilhado)`)
    : consulta.eq("user_id", userId));
  if (error) {
    if (tabelaAusente(error)) {
      return { ok: false, indisponivel: true, mensagem: "O cofre de documentos será liberado quando o banco for atualizado." };
    }
    console.error("[documentos] falha ao listar:", error.message);
    return { ok: false, indisponivel: false, mensagem: "Não foi possível carregar os documentos agora." };
  }
  // O texto cifrado não sai do servidor: só a indicação de que existe.
  return { ok: true, documentos: (data ?? []).map((l) => documentoDaLinha(l as Record<string, unknown>)) };
}

const esquemaDocumento = z.object({
  id: z.uuid().optional(),
  tipo: z.enum(TIPOS_DOCUMENTO),
  titular: z.string().trim().max(120),
  /** Vazio = manter o número atual (na edição) ou não guardar número. */
  numero: z.string().trim().max(64),
  validade: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data de validade inválida."),
  observacao: z.string().trim().max(300),
  escopo: z.enum(["viagem_compartilhado", "pessoal_privado"]),
});

export type ResultadoDocumento =
  | { ok: true; documento: DocumentoVisivel; aviso?: string }
  | { ok: false; mensagem: string };

const AVISO_SEM_CHAVE =
  "Guardamos só os 4 últimos caracteres do número: a criptografia não está configurada no servidor.";

export async function salvarDocumento(entrada: unknown): Promise<ResultadoDocumento> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, mensagem: auth.mensagem };
  const { supabase, userId } = auth.sessao;

  const lido = esquemaDocumento.safeParse(entrada);
  if (!lido.success) return { ok: false, mensagem: lido.error.issues[0]?.message ?? "Dados inválidos." };
  const d = lido.data;
  if (!d.titular && !d.numero && !d.id) return { ok: false, mensagem: "Informe o titular ou o número do documento." };

  const ws = await getWorkspaceAtual();
  if (d.escopo === "viagem_compartilhado" && !ws) {
    return { ok: false, mensagem: "Convide seu par para compartilhar documentos." };
  }

  const id = d.id ?? randomUUID();
  let aviso: string | undefined;
  const campos: Record<string, unknown> = {
    tipo: d.tipo,
    titular: d.titular,
    validade: d.validade || null,
    observacao: d.observacao,
    escopo: d.escopo,
  };
  if (d.numero) {
    const cifrado = cifrarNumeroDocumento(d.numero, { documentoId: id, userId });
    if (!cifrado) aviso = AVISO_SEM_CHAVE;
    campos.numero_cifrado = cifrado;
    campos.numero_final = finalDoNumero(d.numero);
  }

  const resposta = d.id
    ? await supabase.from("documentos_viagem").update(campos).eq("id", d.id).eq("user_id", userId).select(COLUNAS_VISIVEIS).maybeSingle()
    : await supabase
        .from("documentos_viagem")
        .insert({ id, user_id: userId, workspace_id: ws?.id ?? null, ...campos })
        .select(COLUNAS_VISIVEIS)
        .single();

  if (resposta.error) {
    if (tabelaAusente(resposta.error)) return { ok: false, mensagem: "O cofre será liberado quando o banco for atualizado." };
    console.error("[documentos] falha ao salvar:", resposta.error.message);
    return { ok: false, mensagem: "Não foi possível guardar o documento agora." };
  }
  if (!resposta.data) return { ok: false, mensagem: "Documento não encontrado." };
  return { ok: true, documento: documentoDaLinha(resposta.data as Record<string, unknown>), aviso };
}

export async function removerDocumento(id: unknown): Promise<{ ok: boolean; mensagem?: string }> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, mensagem: auth.mensagem };
  const lido = z.uuid().safeParse(id);
  if (!lido.success) return { ok: false, mensagem: "Documento inválido." };
  const { error } = await auth.sessao.supabase
    .from("documentos_viagem")
    .delete()
    .eq("id", lido.data)
    .eq("user_id", auth.sessao.userId);
  if (error) {
    console.error("[documentos] falha ao remover:", error.message);
    return { ok: false, mensagem: "Não foi possível remover agora." };
  }
  return { ok: true };
}

/** Decifra o número sob demanda (com cota: 30 consultas por hora). */
export async function revelarNumeroDocumento(
  id: unknown
): Promise<{ ok: true; numero: string } | { ok: false; mensagem: string }> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, mensagem: auth.mensagem };
  const lido = z.uuid().safeParse(id);
  if (!lido.success) return { ok: false, mensagem: "Documento inválido." };

  const cota = await consumirCota(auth.sessao.supabase, auth.sessao.userId, "documento");
  if (!cota.permitido) return { ok: false, mensagem: cota.mensagem };

  // A RLS decide quem lê: o dono ou o par, se o documento foi compartilhado.
  const { data, error } = await auth.sessao.supabase
    .from("documentos_viagem")
    .select("id, user_id, numero_cifrado")
    .eq("id", lido.data)
    .maybeSingle();
  if (error || !data) return { ok: false, mensagem: "Documento não encontrado." };
  if (typeof data.numero_cifrado !== "string" || !data.numero_cifrado) {
    return { ok: false, mensagem: "Este documento guarda só os 4 últimos caracteres." };
  }
  const numero = decifrarNumeroDocumento(data.numero_cifrado, { documentoId: String(data.id), userId: String(data.user_id) });
  if (numero === null) {
    console.error("[documentos] não foi possível decifrar", data.id);
    return { ok: false, mensagem: "Não foi possível abrir o número agora." };
  }
  return { ok: true, numero };
}

const esquemaLegado = z
  .array(
    z.object({
      tipo: z.string().max(40),
      titular: z.string().max(120),
      numero: z.string().max(64),
      observacao: z.string().max(300),
    })
  )
  .max(200);

/** Importa os documentos antigos do navegador, já cifrando os números. */
export async function importarDocumentosLegados(
  entrada: unknown
): Promise<{ ok: true; importados: number; aviso?: string } | { ok: false; mensagem: string }> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, mensagem: auth.mensagem };
  const lido = esquemaLegado.safeParse(entrada);
  if (!lido.success) return { ok: false, mensagem: "Documentos inválidos." };
  const ws = await getWorkspaceAtual();
  const { supabase, userId } = auth.sessao;

  let semChave = false;
  const linhas = lido.data
    .filter((d) => d.titular.trim() || d.numero.trim())
    .map((d) => {
      const id = randomUUID();
      const numero = d.numero.trim();
      const cifrado = numero ? cifrarNumeroDocumento(numero, { documentoId: id, userId }) : null;
      if (numero && !cifrado) semChave = true;
      return {
        id,
        user_id: userId,
        workspace_id: ws?.id ?? null,
        tipo: (TIPOS_DOCUMENTO as readonly string[]).includes(d.tipo) ? d.tipo : "Outro",
        titular: d.titular.trim(),
        numero_cifrado: cifrado,
        numero_final: numero ? finalDoNumero(numero) : null,
        observacao: d.observacao.trim(),
        escopo: "pessoal_privado",
      };
    });
  if (linhas.length === 0) return { ok: true, importados: 0 };

  const { error } = await supabase.from("documentos_viagem").insert(linhas);
  if (error) {
    if (tabelaAusente(error)) return { ok: false, mensagem: "O cofre será liberado quando o banco for atualizado." };
    console.error("[documentos] falha ao importar:", error.message);
    return { ok: false, mensagem: "Não foi possível importar os documentos agora." };
  }
  return { ok: true, importados: linhas.length, aviso: semChave ? AVISO_SEM_CHAVE : undefined };
}
