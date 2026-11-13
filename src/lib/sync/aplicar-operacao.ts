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

/** Erros do Postgres que dizem "estes dados não entram" (repetir não adianta). */
const CODIGOS_VALIDACAO = ["23514", "23503", "23502", "22P02", "22007", "22008", "22003", "22001"];

/** "indisponivel" = banco sem a tabela/coluna desta versão: a fila espera (modo local). */
export function classificarErro(opId: string, erro: ErroBanco): ResultadoOperacao | "indisponivel" {
  if (tabelaAusente(erro) || colunaAusente(erro)) return "indisponivel";
  const code = erro.code ?? "";
  if (code === "42501") {
    return { opId, status: "rejeitada", motivo: "permissao", mensagem: "Sem permissão para alterar este item." };
  }
  if (CODIGOS_VALIDACAO.includes(code)) {
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

/* ------------------------------ lote (sem N+1) ------------------------------ */

export interface ResultadoLote {
  /** Banco sem as tabelas/colunas desta versão: o resto da fila espera no aparelho. */
  indisponivel: boolean;
  resultados: ResultadoOperacao[];
}

type Grupo = { tipo: OperacaoBruta["tipo"]; recurso: Recurso; ops: OperacaoBruta[] };

/** Operações seguidas de mesmo tipo e recurso (criar/remover); atualizar fica sozinha (cada uma tem campos próprios). */
function agrupar(ops: readonly OperacaoBruta[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const op of ops) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && op.tipo !== "atualizar" && ultimo.tipo === op.tipo && ultimo.recurso === op.recurso) ultimo.ops.push(op);
    else grupos.push({ tipo: op.tipo, recurso: op.recurso, ops: [op] });
  }
  return grupos;
}

/**
 * O erro de uma gravação em massa: "indisponivel" (banco sem a migration),
 * "uma_a_uma" (duplicata, CHECK ou permissão: cada operação precisa do seu
 * próprio resultado) ou "temporario" (rede, banco instável: o grupo inteiro
 * fica para a próxima rodada, sem multiplicar requisições).
 */
function tratarErroEmMassa(erro: ErroBanco): "indisponivel" | "uma_a_uma" | "temporario" {
  if (tabelaAusente(erro) || colunaAusente(erro)) return "indisponivel";
  const code = erro.code ?? "";
  if (code === "23505" || code === "42501" || CODIGOS_VALIDACAO.includes(code)) return "uma_a_uma";
  console.error("[sincronizacao] erro temporário num lote:", code, erro.message);
  return "temporario";
}

/**
 * Aplica um lote da fila (até `MAX_OPERACOES_POR_LOTE`) sem uma ida ao banco
 * por operação: criações seguidas do mesmo recurso viram UM insert e remoções
 * seguidas, UM delete com `in`. Os grupos seguem a ordem da fila (um item do
 * roteiro depende do dia criado antes dele). Se a gravação em massa esbarrar
 * numa duplicata, num CHECK ou na RLS, o grupo é refeito uma a uma
 * (`aplicarOperacao`), para cada operação receber o próprio resultado.
 */
export async function aplicarLote(
  supabase: SupabaseClient,
  userId: string,
  ws: Pick<Workspace, "id"> | null,
  ops: readonly OperacaoBruta[]
): Promise<ResultadoLote> {
  const resultados: ResultadoOperacao[] = [];

  const umaAUma = async (grupo: readonly OperacaoBruta[]): Promise<boolean> => {
    for (const op of grupo) {
      const r = await aplicarOperacao(supabase, userId, ws, op);
      if (r === "indisponivel") return false;
      resultados.push(r);
    }
    return true;
  };

  for (const grupo of agrupar(ops)) {
    if (grupo.ops.length === 1 || grupo.tipo === "atualizar") {
      if (!(await umaAUma(grupo.ops))) return { indisponivel: true, resultados };
      continue;
    }

    const tabela = TABELAS[grupo.recurso];

    if (grupo.tipo === "remover") {
      const ids = grupo.ops.map((op) => (op as Extract<OperacaoBruta, { tipo: "remover" }>).id);
      const { error } = await supabase.from(tabela).delete().in("id", ids);
      if (!error) {
        for (const op of grupo.ops) resultados.push({ opId: op.opId, status: "aplicada" });
        continue;
      }
      const tratamento = tratarErroEmMassa(error);
      if (tratamento === "indisponivel") return { indisponivel: true, resultados };
      if (tratamento === "temporario") {
        for (const op of grupo.ops) resultados.push({ opId: op.opId, status: "adiada", mensagem: "O servidor não respondeu agora. Tentaremos de novo." });
        continue;
      }
      if (!(await umaAUma(grupo.ops))) return { indisponivel: true, resultados };
      continue;
    }

    // criar: valida cada uma; as inválidas saem com o próprio motivo e as
    // demais vão juntas.
    const colunas = COLUNAS[grupo.recurso];
    const mapear = DA_LINHA[grupo.recurso] as (l: Record<string, unknown>) => Registro;
    const validas: { op: OperacaoBruta; linha: Record<string, unknown> }[] = [];
    const recusadas = new Map<string, ResultadoOperacao>();
    for (const op of grupo.ops) {
      const lido = ESQUEMAS_CRIAR[grupo.recurso].safeParse((op as Extract<OperacaoBruta, { tipo: "criar" }>).registro);
      if (!lido.success) {
        recusadas.set(op.opId, { opId: op.opId, status: "rejeitada", motivo: "validacao", mensagem: lido.error.issues[0]?.message ?? "Dados inválidos." });
        continue;
      }
      const campos = lido.data as Record<string, unknown>;
      if (DO_ESPACO.includes(grupo.recurso) && !ws) {
        recusadas.set(op.opId, { opId: op.opId, status: "rejeitada", motivo: "sem_espaco", mensagem: "O espaço do casal ainda não está pronto." });
        continue;
      }
      if (grupo.recurso === "despesas" && campos.escopo === "viagem_compartilhado" && !ws) {
        recusadas.set(op.opId, { opId: op.opId, status: "rejeitada", motivo: "sem_espaco", mensagem: "Convide seu par para compartilhar gastos." });
        continue;
      }
      const linha: Record<string, unknown> = { ...paraColunas(grupo.recurso, campos), workspace_id: ws?.id ?? null };
      if (grupo.recurso === "despesas" || grupo.recurso === "alertas") linha.user_id = userId;
      if (grupo.recurso === "despesas" && !linha.pago_por) linha.pago_por = userId;
      validas.push({ op, linha });
    }

    let emMassa: Map<string, ResultadoOperacao> | "uma_a_uma" | "temporario" = new Map();
    if (validas.length > 0) {
      const { data, error } = await supabase.from(tabela).insert(validas.map((v) => v.linha)).select(colunas);
      if (error) {
        const tratamento = tratarErroEmMassa(error);
        if (tratamento === "indisponivel") return { indisponivel: true, resultados };
        emMassa = tratamento;
      } else {
        const gravados = new Map(
          ((data ?? []) as unknown as Record<string, unknown>[]).map((l) => [String(l.id), mapear(l)] as const)
        );
        emMassa = new Map(
          validas.map(({ op, linha }) => {
            const registro = gravados.get(String(linha.id));
            return [op.opId, registro ? { opId: op.opId, status: "aplicada", registro } : { opId: op.opId, status: "aplicada" }];
          })
        );
      }
    }

    if (emMassa === "uma_a_uma") {
      // Na ordem original, recusadas no lugar delas.
      for (const op of grupo.ops) {
        const recusada = recusadas.get(op.opId);
        if (recusada) {
          resultados.push(recusada);
          continue;
        }
        if (!(await umaAUma([op]))) return { indisponivel: true, resultados };
      }
      continue;
    }
    for (const op of grupo.ops) {
      const r =
        recusadas.get(op.opId) ??
        (emMassa === "temporario"
          ? { opId: op.opId, status: "adiada" as const, mensagem: "O servidor não respondeu agora. Tentaremos de novo." }
          : emMassa.get(op.opId)!);
      resultados.push(r);
    }
  }
  return { indisponivel: false, resultados };
}
