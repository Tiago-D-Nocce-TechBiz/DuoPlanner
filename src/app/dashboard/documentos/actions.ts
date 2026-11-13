"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ErroAcao, withAuthAction } from "@/lib/acoes/com-sessao";
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
 *
 * Falhas: NAO_CONFIGURADO = banco sem a tabela (o cofre fica desligado);
 * INDISPONIVEL = falha temporária (a tela mostra a última cópia).
 */

const COLUNAS_VISIVEIS =
  "id, user_id, tipo, titular, numero_final, numero_cifrado, validade, observacao, escopo, atualizado_em";

const COFRE_DESLIGADO = "O cofre de documentos será liberado quando o banco for atualizado.";

function falhaDoBanco(erro: { code?: string; message?: string }, contexto: string, mensagem: string): ErroAcao {
  if (tabelaAusente(erro)) return new ErroAcao("NAO_CONFIGURADO", COFRE_DESLIGADO);
  console.error(`[documentos] falha ao ${contexto}:`, erro.message);
  return new ErroAcao("INDISPONIVEL", mensagem);
}

export const listarDocumentos = withAuthAction("listarDocumentos", async ({ sessao }): Promise<DocumentoVisivel[]> => {
  const ws = await getWorkspaceAtual(sessao);
  const { userId, supabase } = sessao;
  const consulta = supabase
    .from("documentos_viagem")
    .select(COLUNAS_VISIVEIS)
    .order("atualizado_em", { ascending: false })
    .limit(200);
  const { data, error } = await (ws
    ? consulta.or(`user_id.eq.${userId},and(workspace_id.eq.${ws.id},escopo.eq.viagem_compartilhado)`)
    : consulta.eq("user_id", userId));
  if (error) throw falhaDoBanco(error, "listar", "Não foi possível carregar os documentos agora.");
  // O texto cifrado não sai do servidor: só a indicação de que existe.
  return (data ?? []).map((l) => documentoDaLinha(l as Record<string, unknown>));
});

const esquemaDocumento = z.object({
  id: z.uuid().optional(),
  tipo: z.enum(TIPOS_DOCUMENTO, { error: "Tipo de documento inválido." }),
  titular: z.string().trim().max(120, "Titular: até 120 caracteres."),
  /** Vazio = manter o número atual (na edição) ou não guardar número. */
  numero: z.string().trim().max(64, "Número: até 64 caracteres."),
  validade: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data de validade inválida."),
  observacao: z.string().trim().max(300, "Observação: até 300 caracteres."),
  escopo: z.enum(["viagem_compartilhado", "pessoal_privado"]),
});

export interface DocumentoSalvo {
  documento: DocumentoVisivel;
  aviso?: string;
}

const AVISO_SEM_CHAVE =
  "Guardamos só os 4 últimos caracteres do número: a criptografia não está configurada no servidor.";

export const salvarDocumento = withAuthAction(
  "salvarDocumento",
  esquemaDocumento,
  async (d, { sessao }): Promise<DocumentoSalvo> => {
    const { supabase, userId } = sessao;
    if (!d.titular && !d.numero && !d.id) throw new ErroAcao("ENTRADA_INVALIDA", "Informe o titular ou o número do documento.");

    const ws = await getWorkspaceAtual(sessao);
    if (d.escopo === "viagem_compartilhado" && !ws) {
      throw new ErroAcao("CONFLITO", "Convide seu par para compartilhar documentos.");
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
      ? await supabase
          .from("documentos_viagem")
          .update(campos)
          .eq("id", d.id)
          .eq("user_id", userId)
          .select(COLUNAS_VISIVEIS)
          .maybeSingle()
      : await supabase
          .from("documentos_viagem")
          .insert({ id, user_id: userId, workspace_id: ws?.id ?? null, ...campos })
          .select(COLUNAS_VISIVEIS)
          .single();

    if (resposta.error) throw falhaDoBanco(resposta.error, "salvar", "Não foi possível guardar o documento agora.");
    if (!resposta.data) throw new ErroAcao("NAO_ENCONTRADO", "Documento não encontrado.");
    return { documento: documentoDaLinha(resposta.data as Record<string, unknown>), aviso };
  }
);

const idDocumento = z.uuid({ error: "Documento inválido." });

export const removerDocumento = withAuthAction("removerDocumento", idDocumento, async (id, { sessao }): Promise<null> => {
  const { error } = await sessao.supabase.from("documentos_viagem").delete().eq("id", id).eq("user_id", sessao.userId);
  if (error) throw falhaDoBanco(error, "remover", "Não foi possível remover agora.");
  return null;
});

/** Decifra o número sob demanda (com cota: 30 consultas por hora). */
export const revelarNumeroDocumento = withAuthAction(
  "revelarNumeroDocumento",
  idDocumento,
  async (id, { sessao }): Promise<{ numero: string }> => {
    const cota = await consumirCota(sessao.supabase, sessao.userId, "documento");
    if (!cota.permitido) throw new ErroAcao("COTA_EXCEDIDA", cota.mensagem);

    // A RLS decide quem lê: o dono ou o par, se o documento foi compartilhado.
    const { data, error } = await sessao.supabase
      .from("documentos_viagem")
      .select("id, user_id, numero_cifrado")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) throw new ErroAcao("NAO_ENCONTRADO", "Documento não encontrado.");
    if (typeof data.numero_cifrado !== "string" || !data.numero_cifrado) {
      throw new ErroAcao("NAO_ENCONTRADO", "Este documento guarda só os 4 últimos caracteres.");
    }
    const numero = decifrarNumeroDocumento(data.numero_cifrado, { documentoId: String(data.id), userId: String(data.user_id) });
    if (numero === null) {
      console.error("[documentos] não foi possível decifrar", data.id);
      throw new ErroAcao("INDISPONIVEL", "Não foi possível abrir o número agora.");
    }
    return { numero };
  }
);

const esquemaLegado = z
  .array(
    z.object({
      tipo: z.string().max(40),
      titular: z.string().max(120),
      numero: z.string().max(64),
      observacao: z.string().max(300),
    })
  )
  .max(200, "Documentos demais para importar de uma vez.");

/** Importa os documentos antigos do navegador, já cifrando os números. */
export const importarDocumentosLegados = withAuthAction(
  "importarDocumentosLegados",
  esquemaLegado,
  async (documentos, { sessao }): Promise<{ importados: number; aviso?: string }> => {
    const ws = await getWorkspaceAtual(sessao);
    const { supabase, userId } = sessao;

    let semChave = false;
    const linhas = documentos
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
    if (linhas.length === 0) return { importados: 0 };

    const { error } = await supabase.from("documentos_viagem").insert(linhas);
    if (error) throw falhaDoBanco(error, "importar", "Não foi possível importar os documentos agora.");
    return { importados: linhas.length, aviso: semChave ? AVISO_SEM_CHAVE : undefined };
  }
);
