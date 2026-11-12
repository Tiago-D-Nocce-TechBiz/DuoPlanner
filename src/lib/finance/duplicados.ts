import { toCents } from "./money";

/**
 * Compras da fatura que já estão no DuoFinance (puro, testável).
 *
 * Quem importa a fatura depois da viagem costuma já ter lançado parte das
 * compras (à mão, pela Nora ou por recibo), ou importa a mesma fatura duas
 * vezes. Salvar de novo dobraria o gasto e o acerto de contas. Duas camadas,
 * nesta ordem:
 *
 *  1. JÁ IMPORTADA (exata): a linha tem o mesmo `transaction_fingerprint`
 *     (./fingerprint) de um gasto que a PRÓPRIA pessoa importou. Só os gastos
 *     dela contam: o par pode ter a mesma compra no cartão dele (racharam a
 *     conta do restaurante em dois cartões), e isso não é duplicata.
 *  2. PARECE JÁ LANÇADA (heurística): um gasto SEM fingerprint (lançado à
 *     mão, pela Nora, por recibo ou importado antes do fingerprint) e PAGO pela
 *     pessoa, com a mesma data, moeda e valor ao centavo. Gasto pago pelo par
 *     não está no cartão de quem importa; gasto com fingerprint diferente é
 *     outra compra, já identificada com exatidão. Parcelas: a fatura repete a
 *     data da compra em todo mês, então parcela conhecida dos dois lados só
 *     casa com a MESMA parcela (a 3/10 não é a 2/10 do mês passado). Cada
 *     gasto existente casa com uma única linha: duas corridas iguais no mesmo
 *     dia com só uma lançada deixam a segunda livre.
 *
 * As duas começam fora do salvamento; a tela deixa salvar mesmo assim.
 */

export type MotivoDuplicado =
  | { tipo: "ja_importado"; descricao: string }
  | { tipo: "parece_lancado"; descricao: string };

export interface LinhaImportada {
  id: string;
  dataIso: string;
  valor: number;
  moeda: string;
  /** null quando o navegador não calculou (sem Web Crypto). */
  fingerprint: string | null;
  /** null = compra à vista. */
  parcela?: { atual: number; total: number } | null;
}

/** Subconjunto de `Despesa` usado na comparação. */
export interface GastoExistente {
  data: string;
  valor: number;
  moeda: string;
  tipo: "gasto" | "acerto";
  descricao: string;
  /** Quem lançou. */
  userId: string;
  /** Quem pagou; null = quem lançou. */
  pagoPor: string | null;
  transactionFingerprint?: string | null;
  parcelaAtual?: number | null;
  totalParcelas?: number | null;
}

const chaveHeuristica = (data: string, moeda: string, valor: number) =>
  `${data}|${moeda.trim().toUpperCase()}|${toCents(valor)}`;

/** Parcela conhecida dos dois lados precisa ser a mesma; senão, não dá para saber. */
function parcelaCompativel(l: LinhaImportada, g: GastoExistente): boolean {
  if (!l.parcela || !g.parcelaAtual || !g.totalParcelas) return true;
  return l.parcela.atual === g.parcelaAtual && l.parcela.total === g.totalParcelas;
}

/** id da linha importada → por que ela já parece estar no DuoFinance. */
export function reconciliarImportacao(
  linhas: readonly LinhaImportada[],
  existentes: readonly GastoExistente[],
  meuId: string
): Map<string, MotivoDuplicado> {
  const resultado = new Map<string, MotivoDuplicado>();

  // 1. Fingerprint exato, só entre os gastos que a própria pessoa importou.
  const porFingerprint = new Map<string, GastoExistente>();
  for (const g of existentes) {
    if (g.userId === meuId && g.transactionFingerprint) porFingerprint.set(g.transactionFingerprint, g);
  }
  for (const l of linhas) {
    const g = l.fingerprint ? porFingerprint.get(l.fingerprint) : undefined;
    if (g) resultado.set(l.id, { tipo: "ja_importado", descricao: g.descricao });
  }

  // 2. Heurística (data + moeda + centavos), um para um, entre os gastos sem
  //    fingerprint pagos pela pessoa.
  const disponiveis = new Map<string, GastoExistente[]>();
  for (const g of existentes) {
    if (g.tipo !== "gasto" || g.transactionFingerprint || (g.pagoPor ?? g.userId) !== meuId) continue;
    if (!Number.isFinite(g.valor)) continue;
    const k = chaveHeuristica(g.data, g.moeda, g.valor);
    const lista = disponiveis.get(k);
    if (lista) lista.push(g);
    else disponiveis.set(k, [g]);
  }
  for (const l of linhas) {
    if (resultado.has(l.id)) continue;
    const candidatos = disponiveis.get(chaveHeuristica(l.dataIso, l.moeda, l.valor));
    const indice = candidatos?.findIndex((g) => parcelaCompativel(l, g)) ?? -1;
    if (!candidatos || indice < 0) continue;
    const [g] = candidatos.splice(indice, 1);
    resultado.set(l.id, { tipo: "parece_lancado", descricao: g.descricao });
  }
  return resultado;
}
