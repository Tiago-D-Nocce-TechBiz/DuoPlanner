/**
 * Motor do Acerto de Contas (puro, testável). Tudo em CENTAVOS inteiros para
 * nunca perder 1 centavo em arredondamento: a parte de um é calculada e a do
 * outro é o restante, então a soma sempre fecha.
 *
 * Papéis: "dono" = quem criou o espaço; "parceiro" = quem entrou por convite.
 *
 * Regras do casal (acordos_divisao):
 *  - igual:        50/50;
 *  - proporcional: o dono arca com X% (ex.: 60/40, proporcional à renda);
 *  - fixo:         o dono cobre um valor fixo do total; o parceiro, o resto.
 * Um gasto pode ter divisão própria (`proporcaoDivisao` = % que cabe a quem
 * pagou), que vence a regra geral. Pagamentos do acerto (`tipo: "acerto"`)
 * contam como dinheiro que vai inteiro para o outro — e zeram o saldo.
 */

export type Papel = "dono" | "parceiro";

export type RegraDivisao =
  | { regra: "igual" }
  | { regra: "proporcional"; percentualDono: number }
  /** `quemCobre` arca com `valorFixo` do total; o outro, com o restante. */
  | { regra: "fixo"; valorFixo: number; quemCobre: Papel };

export interface LancamentoAcerto {
  /** Valor em reais (já convertido de moeda estrangeira). */
  valorBrl: number;
  /** Quem pagou (user id). */
  pagoPor: string;
  /** % do valor que cabe a quem pagou; null = vale a regra do casal. */
  proporcaoDivisao: number | null;
  tipo: "gasto" | "acerto";
}

export interface ResultadoAcerto {
  /** Soma dos gastos compartilhados (sem os pagamentos de acerto), em reais. */
  totalGastos: number;
  pago: Record<Papel, number>;
  parte: Record<Papel, number>;
  /** pago − parte: positivo = tem a receber; negativo = deve. */
  saldo: Record<Papel, number>;
  devedor: Papel | null;
  credor: Papel | null;
  /** Quanto o devedor transfere ao credor para zerar. */
  valorAcerto: number;
  /** Lançamentos ignorados porque quem pagou não é do espaço. */
  ignorados: number;
}

const centavos = (reais: number) => Math.round(reais * 100);
const reais = (c: number) => c / 100;
const outro = (p: Papel): Papel => (p === "dono" ? "parceiro" : "dono");

/** Parte de `totalCentavos` que cabe a quem tem `percentual` (0–100). */
function fatiar(totalCentavos: number, percentual: number): number {
  const p = Math.min(100, Math.max(0, percentual));
  return Math.round((totalCentavos * p) / 100);
}

export function calcularAcerto(
  lancamentos: LancamentoAcerto[],
  membros: { dono: string; parceiro: string },
  regra: RegraDivisao
): ResultadoAcerto {
  const pago: Record<Papel, number> = { dono: 0, parceiro: 0 };
  const parte: Record<Papel, number> = { dono: 0, parceiro: 0 };
  let totalGastos = 0;
  let pelaRegra = 0;
  let ignorados = 0;

  for (const l of lancamentos) {
    const valor = centavos(l.valorBrl);
    if (!(valor > 0)) continue;
    const quem: Papel | null =
      l.pagoPor === membros.dono ? "dono" : l.pagoPor === membros.parceiro ? "parceiro" : null;
    if (!quem) {
      ignorados++;
      continue;
    }
    pago[quem] += valor;

    if (l.tipo === "acerto") {
      parte[outro(quem)] += valor;
      continue;
    }

    totalGastos += valor;
    if (l.proporcaoDivisao !== null && Number.isFinite(l.proporcaoDivisao)) {
      const daPagadora = fatiar(valor, l.proporcaoDivisao);
      parte[quem] += daPagadora;
      parte[outro(quem)] += valor - daPagadora;
    } else {
      pelaRegra += valor;
    }
  }

  let doDono: number;
  if (regra.regra === "proporcional") {
    doDono = fatiar(pelaRegra, regra.percentualDono);
  } else if (regra.regra === "fixo") {
    const fixo = Math.min(Math.max(0, centavos(regra.valorFixo)), pelaRegra);
    doDono = regra.quemCobre === "dono" ? fixo : pelaRegra - fixo;
  } else {
    doDono = fatiar(pelaRegra, 50);
  }
  parte.dono += doDono;
  parte.parceiro += pelaRegra - doDono;

  const saldo: Record<Papel, number> = {
    dono: pago.dono - parte.dono,
    parceiro: pago.parceiro - parte.parceiro,
  };
  const devedor: Papel | null = saldo.dono < 0 ? "dono" : saldo.parceiro < 0 ? "parceiro" : null;

  return {
    totalGastos: reais(totalGastos),
    pago: { dono: reais(pago.dono), parceiro: reais(pago.parceiro) },
    parte: { dono: reais(parte.dono), parceiro: reais(parte.parceiro) },
    saldo: { dono: reais(saldo.dono), parceiro: reais(saldo.parceiro) },
    devedor,
    credor: devedor ? outro(devedor) : null,
    valorAcerto: devedor ? reais(Math.abs(saldo[devedor])) : 0,
    ignorados,
  };
}

/** Valor em reais de um gasto (moeda estrangeira × cotação usada). */
export function valorEmReais(d: { valor: number; moeda: string; cotacaoBrl: number | null }): number | null {
  if (d.moeda === "BRL") return d.valor;
  if (!d.cotacaoBrl || !(d.cotacaoBrl > 0)) return null;
  return Math.round(d.valor * d.cotacaoBrl * 100) / 100;
}

/** Percentual do dono na regra (para exibir "60/40"). Fixo não tem percentual. */
export function percentualDono(regra: RegraDivisao): number | null {
  if (regra.regra === "igual") return 50;
  if (regra.regra === "proporcional") return Math.min(100, Math.max(0, regra.percentualDono));
  return null;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Descrição curta da regra, com os nomes do casal. */
export function descreverRegra(regra: RegraDivisao, nomes: Record<Papel, string>): string {
  if (regra.regra === "igual") return "Divisão igual (50/50)";
  if (regra.regra === "proporcional") {
    const p = Math.min(100, Math.max(0, regra.percentualDono));
    return `${nomes.dono} ${formatarPercentual(p)} · ${nomes.parceiro} ${formatarPercentual(100 - p)}`;
  }
  const quem = nomes[regra.quemCobre];
  const resto = nomes[outro(regra.quemCobre)];
  return `${quem} cobre ${brl(regra.valorFixo)}; ${resto}, o restante`;
}

function formatarPercentual(p: number): string {
  return `${Number.isInteger(p) ? p : p.toFixed(1).replace(".", ",")}%`;
}
