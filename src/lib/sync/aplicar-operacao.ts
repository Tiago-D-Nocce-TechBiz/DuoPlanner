import type { SupabaseClient } from "@supabase/supabase-js";
import { colunaAusente, tabelaAusente } from "@/lib/auth/seguranca";
import type { Workspace } from "@/lib/supabase/workspace";
import { ESQUEMAS_ATUALIZAR, ESQUEMAS_CRIAR, paraColunas, type OperacaoBruta } from "./esquemas";
import { COLUNAS, DA_LINHA, TABELAS, type Recurso, type Registro } from "./modelos";

/**
 * Aplica UMA operação da fila do aparelho no banco (servidor).
 *
 * Separado da Server Action (`app/dashboard/sincronizacao-actions.ts`) para
 * ser testável com um cliente falso. A operação chega já com o formato do
 * envelope validado; os campos são validados aqui, por recurso, com os mesmos
 * esquemas do cliente. `user_id`/`workspace_id` vêm da sessão.
 */

export type ResultadoOperacao =
  | { opId: string; status: "aplicada"; registro?: Registro }
  | {
      opId: string;
      status: "rejeitada";
      /**
       * "duplicado": a mesma compra da fatura já está gravada por esta pessoa
       * (índice único do `transaction_fingerprint`). O aparelho descarta a
       * cópia em silêncio: não há o que corrigir.
       */
      motivo: "validacao" | "permissao" | "nao_encontrado" | "sem_espaco" | "duplicado";
      mensagem: string;
    }
  | { opId: string; status: "adiada"; mensagem: string };

/** Recursos que pertencem ao espaço (não existem sem um workspace). */
const DO_ESPACO: readonly Recurso[] = ["roteiro_dias", "roteiro_itens", "checklist"];

type ErroBanco = { code?: string; message?: string };

/** "indisponivel" = banco sem a tabela/coluna desta versão: a fila espera (modo local). */
export function classificarErro(opId: string, erro: ErroBanco): ResultadoOperacao | "indisponivel" {
  if (tabelaAusente(erro) || colunaAusente(erro)) return "indisponivel";
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

export async function aplicarOperacao(
  supabase: SupabaseClient,
  userId: string,
  ws: Pick<Workspace, "id"> | null,
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
      return {
        opId: op.opId,
        status: "rejeitada",
        motivo: "nao_encontrado",
        mensagem: "Este item foi removido ou não está mais compartilhado.",
      };
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
  if (!error) return { opId: op.opId, status: "aplicada", registro: mapear(data as unknown as Record<string, unknown>) };
  if (error.code !== "23505") return classificarErro(op.opId, error);

  // Reenvio da mesma criação (a resposta anterior se perdeu na rede): o
  // registro com este id já existe e a operação é idempotente.
  const { data: existente } = await supabase.from(tabela).select(colunas).eq("id", campos.id as string).maybeSingle();
  if (existente) {
    return { opId: op.opId, status: "aplicada", registro: mapear(existente as unknown as Record<string, unknown>) };
  }
  // Outro id com a mesma compra da fatura (outra aba, outro aparelho).
  if (op.recurso === "despesas" && campos.transactionFingerprint) {
    return { opId: op.opId, status: "rejeitada", motivo: "duplicado", mensagem: "Esta compra da fatura já estava salva." };
  }
  // Duplicidade sem registro visível: repetir não resolve (não é falha temporária).
  return { opId: op.opId, status: "rejeitada", motivo: "validacao", mensagem: "Este item já existe no servidor." };
}
