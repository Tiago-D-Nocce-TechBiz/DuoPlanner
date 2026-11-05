import { CATEGORIAS, ESCOPOS, type Categoria, type Escopo } from "@/lib/finance/classificar";
import { CATEGORIAS_DUOFINANCE, type CategoriaDuoFinance } from "@/lib/finance/categorias-duofinance";

/**
 * Modelos sincronizados entre o casal (puro: usado no navegador e no servidor).
 *
 * Cada "recurso" é uma tabela do Postgres com RLS por espaço. Aqui ficam o
 * tipo de domínio (camelCase), as colunas lidas e a conversão linha → domínio
 * (números do PostgREST/Realtime podem chegar como string: tudo é coagido).
 */

export type Recurso = "despesas" | "roteiro_dias" | "roteiro_itens" | "checklist" | "alertas";

export const RECURSOS: readonly Recurso[] = ["despesas", "roteiro_dias", "roteiro_itens", "checklist", "alertas"];

export const TABELAS: Record<Recurso, string> = {
  despesas: "despesas_viagem",
  roteiro_dias: "roteiro_dias",
  roteiro_itens: "roteiro_itens",
  checklist: "checklist_itens",
  alertas: "alertas_preco",
};

export const RECURSO_POR_TABELA: Record<string, Recurso> = Object.fromEntries(
  Object.entries(TABELAS).map(([recurso, tabela]) => [tabela, recurso as Recurso])
);

export const COLUNAS: Record<Recurso, string> = {
  despesas:
    "id, user_id, workspace_id, pago_por, tipo, descricao, valor, moeda, cotacao_brl, data, categoria, escopo, proporcao_divisao, origem, o_que_foi_gasto, categoria_detalhada, parcela_atual, total_parcelas, fatura_referencia, criado_em, atualizado_em, atualizado_por",
  roteiro_dias: "id, workspace_id, user_id, data, ordem, atualizado_em, atualizado_por",
  roteiro_itens: "id, workspace_id, dia_id, horario, titulo, descricao, ordem, atualizado_em, atualizado_por",
  checklist: "id, workspace_id, user_id, texto, categoria, feito, ordem, atualizado_em, atualizado_por",
  alertas:
    "id, user_id, workspace_id, tipo, origem, origem_iata, destino, destino_iata, ida, volta, adultos, preco_alvo, ativo, ultimo_preco, ultimo_link, ultima_verificacao_em, ultimo_disparo_em, atualizado_em, atualizado_por",
};

export type OrigemDespesa = "manual" | "importacao" | "recibo" | "nora" | "legado";
export const ORIGENS_DESPESA = ["manual", "importacao", "recibo", "nora", "legado"] as const satisfies readonly OrigemDespesa[];

export interface Despesa {
  id: string;
  userId: string;
  workspaceId: string | null;
  /** Quem pagou; null = quem criou. */
  pagoPor: string | null;
  tipo: "gasto" | "acerto";
  descricao: string;
  valor: number;
  moeda: string;
  cotacaoBrl: number | null;
  data: string; // AAAA-MM-DD
  categoria: Categoria;
  escopo: Escopo;
  /** % que cabe a quem pagou; null = regra do casal. */
  proporcaoDivisao: number | null;
  origem: OrigemDespesa;
  /* Metadados da fatura importada (DuoFinance); ausentes nos demais gastos. */
  /** O que foi gasto, curto (ex.: "Corrida de aplicativo"). */
  oQueFoiGasto?: string | null;
  /** Categoria detalhada da fatura (ex.: "Assinaturas"). */
  categoriaDetalhada?: CategoriaDuoFinance | null;
  /** Parcela cobrada nesta fatura (ex.: 3 de 10); null = à vista. */
  parcelaAtual?: number | null;
  totalParcelas?: number | null;
  /** Mês da fatura, AAAA-MM. */
  faturaReferencia?: string | null;
  criadoEm: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface RoteiroDia {
  id: string;
  workspaceId: string | null;
  userId: string | null;
  data: string | null;
  ordem: number;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface RoteiroItem {
  id: string;
  workspaceId: string | null;
  diaId: string | null;
  horario: string;
  titulo: string;
  nota: string;
  ordem: number;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface ItemChecklist {
  id: string;
  workspaceId: string | null;
  userId: string | null;
  texto: string;
  categoria: string;
  feito: boolean;
  ordem: number;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface AlertaPreco {
  id: string;
  userId: string;
  workspaceId: string | null;
  tipo: "voo" | "hospedagem";
  origem: string;
  origemIata: string | null;
  destino: string;
  destinoIata: string | null;
  ida: string;
  volta: string | null;
  adultos: number;
  precoAlvo: number | null;
  ativo: boolean;
  ultimoPreco: number | null;
  ultimoLink: string | null;
  ultimaVerificacaoEm: string | null;
  ultimoDisparoEm: string | null;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface RegistroPorRecurso {
  despesas: Despesa;
  roteiro_dias: RoteiroDia;
  roteiro_itens: RoteiroItem;
  checklist: ItemChecklist;
  alertas: AlertaPreco;
}

export type Registro = RegistroPorRecurso[Recurso];

/* ------------------------------ coerções ------------------------------ */

type Linha = Record<string, unknown>;

const txt = (v: unknown, padrao = ""): string => (typeof v === "string" ? v : padrao);
const txtOuNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown, padrao = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : padrao;
};
const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const dataIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const umDe = <T extends string>(v: unknown, opcoes: readonly T[], padrao: T): T =>
  typeof v === "string" && (opcoes as readonly string[]).includes(v) ? (v as T) : padrao;

export function despesaDaLinha(l: Linha): Despesa {
  return {
    id: txt(l.id),
    userId: txt(l.user_id),
    workspaceId: txtOuNull(l.workspace_id),
    pagoPor: txtOuNull(l.pago_por),
    tipo: l.tipo === "acerto" ? "acerto" : "gasto",
    descricao: txt(l.descricao, "Despesa"),
    valor: num(l.valor),
    moeda: txt(l.moeda, "BRL").trim().toUpperCase() || "BRL",
    cotacaoBrl: numOuNull(l.cotacao_brl),
    data: dataIso(l.data) ?? txt(l.criado_em).slice(0, 10),
    categoria: umDe(l.categoria, CATEGORIAS, "Gasto Pessoal (Fora da Viagem)"),
    escopo: umDe(l.escopo, ESCOPOS, "pessoal_privado"),
    proporcaoDivisao: numOuNull(l.proporcao_divisao),
    origem: umDe(l.origem, ORIGENS_DESPESA, "manual"),
    oQueFoiGasto: txtOuNull(l.o_que_foi_gasto),
    categoriaDetalhada:
      typeof l.categoria_detalhada === "string" &&
      (CATEGORIAS_DUOFINANCE as readonly string[]).includes(l.categoria_detalhada)
        ? (l.categoria_detalhada as CategoriaDuoFinance)
        : null,
    parcelaAtual: numOuNull(l.parcela_atual),
    totalParcelas: numOuNull(l.total_parcelas),
    faturaReferencia: txtOuNull(l.fatura_referencia),
    criadoEm: txt(l.criado_em),
    atualizadoEm: txt(l.atualizado_em),
    atualizadoPor: txtOuNull(l.atualizado_por),
  };
}

export function roteiroDiaDaLinha(l: Linha): RoteiroDia {
  return {
    id: txt(l.id),
    workspaceId: txtOuNull(l.workspace_id),
    userId: txtOuNull(l.user_id),
    data: dataIso(l.data),
    ordem: num(l.ordem),
    atualizadoEm: txt(l.atualizado_em),
    atualizadoPor: txtOuNull(l.atualizado_por),
  };
}

export function roteiroItemDaLinha(l: Linha): RoteiroItem {
  return {
    id: txt(l.id),
    workspaceId: txtOuNull(l.workspace_id),
    diaId: txtOuNull(l.dia_id),
    horario: txt(l.horario),
    titulo: txt(l.titulo),
    nota: txt(l.descricao),
    ordem: num(l.ordem),
    atualizadoEm: txt(l.atualizado_em),
    atualizadoPor: txtOuNull(l.atualizado_por),
  };
}

export function checklistDaLinha(l: Linha): ItemChecklist {
  return {
    id: txt(l.id),
    workspaceId: txtOuNull(l.workspace_id),
    userId: txtOuNull(l.user_id),
    texto: txt(l.texto),
    categoria: txt(l.categoria, "Mão / Essenciais"),
    feito: l.feito === true,
    ordem: num(l.ordem),
    atualizadoEm: txt(l.atualizado_em),
    atualizadoPor: txtOuNull(l.atualizado_por),
  };
}

export function alertaDaLinha(l: Linha): AlertaPreco {
  return {
    id: txt(l.id),
    userId: txt(l.user_id),
    workspaceId: txtOuNull(l.workspace_id),
    tipo: l.tipo === "hospedagem" ? "hospedagem" : "voo",
    origem: txt(l.origem),
    origemIata: txtOuNull(l.origem_iata),
    destino: txt(l.destino),
    destinoIata: txtOuNull(l.destino_iata),
    ida: dataIso(l.ida) ?? "",
    volta: dataIso(l.volta),
    adultos: num(l.adultos, 2),
    precoAlvo: numOuNull(l.preco_alvo),
    ativo: l.ativo !== false,
    ultimoPreco: numOuNull(l.ultimo_preco),
    ultimoLink: txtOuNull(l.ultimo_link),
    ultimaVerificacaoEm: txtOuNull(l.ultima_verificacao_em),
    ultimoDisparoEm: txtOuNull(l.ultimo_disparo_em),
    atualizadoEm: txt(l.atualizado_em),
    atualizadoPor: txtOuNull(l.atualizado_por),
  };
}

export const DA_LINHA: { [R in Recurso]: (l: Linha) => RegistroPorRecurso[R] } = {
  despesas: despesaDaLinha,
  roteiro_dias: roteiroDiaDaLinha,
  roteiro_itens: roteiroItemDaLinha,
  checklist: checklistDaLinha,
  alertas: alertaDaLinha,
};

/** Quem fez a última alteração (para notificar só mudanças do par). */
export function autorDaAlteracao(r: Registro): string | null {
  if (r.atualizadoPor) return r.atualizadoPor;
  return "userId" in r && typeof r.userId === "string" ? r.userId : null;
}

/** O registro recebido é mais novo (ou igual) que o que já temos? */
export function maisRecente(novo: { atualizadoEm: string }, atual: { atualizadoEm: string } | undefined): boolean {
  if (!atual || !atual.atualizadoEm) return true;
  if (!novo.atualizadoEm) return false;
  return Date.parse(novo.atualizadoEm) >= Date.parse(atual.atualizadoEm);
}
