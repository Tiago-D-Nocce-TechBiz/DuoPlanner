import { calcularCustos, chaveDaCompraParcelada, type GastoParaCusto, type ItemDeRoteiroParaCusto, type ResumoDeCustos } from "@/lib/ai/cost-agent-metrics";
import { todayInSaoPaulo } from "@/lib/dates";
import { valorEmReais } from "@/lib/finance/acerto";
import { toCents } from "@/lib/finance/money";
import { idDoLancamento } from "@/lib/roteiro/lancamento";
import type { Despesa, RoteiroItem } from "@/lib/sync/modelos";
import { getRegistros } from "@/lib/sync/motor";

/**
 * Gestão de custos SEM servidor: as mesmas métricas do servidor
 * (`cost-agent-metrics`), calculadas com a cópia dos dados que o aparelho já
 * tem (motor de sincronização). É o que a gaveta mostra quando a Nora não
 * alcança o servidor (sem conexão): nada de IA, nada de cota.
 *
 * Só entram gastos COMPARTILHADOS. O que é pessoal privado fica fora, como no
 * servidor.
 */
export function custosDeRegistros(despesas: readonly Despesa[], itens: readonly RoteiroItem[], hojeIso: string): ResumoDeCustos {
  const compartilhados = despesas.filter((d) => d.tipo === "gasto" && d.escopo === "viagem_compartilhado");
  const gastos: GastoParaCusto[] = [];
  let semCotacao = 0;
  for (const d of compartilhados) {
    const emReais = valorEmReais({ valor: d.valor, moeda: d.moeda, cotacaoBrl: d.cotacaoBrl });
    if (emReais === null || !Number.isFinite(emReais)) {
      semCotacao++;
      continue;
    }
    const centavos = toCents(emReais);
    const parcelaAtual = d.parcelaAtual ?? null;
    const totalParcelas = d.totalParcelas ?? null;
    gastos.push({
      centavos,
      categoria: d.categoria,
      dia: d.data,
      parcelaAtual,
      totalParcelas,
      compra: parcelaAtual !== null && totalParcelas !== null ? chaveDaCompraParcelada(d.descricao, centavos, totalParcelas) : null,
    });
  }
  const idsDeGastos = new Set(compartilhados.map((d) => d.id));
  const roteiro: ItemDeRoteiroParaCusto[] = [];
  for (const i of itens) {
    const valor = i.custoEstimado ?? 0;
    if (!(valor > 0) || !Number.isFinite(valor)) continue;
    roteiro.push({ custoCentavos: toCents(valor), lancado: idsDeGastos.has(idDoLancamento(i.id, "compartilhado", "")) });
  }
  return calcularCustos({ gastos, roteiro, semCotacao, truncado: false, hojeIso });
}

/** Custos do casal com o que o aparelho guardou. */
export function custosDoAparelho(): ResumoDeCustos {
  return custosDeRegistros(getRegistros("despesas"), getRegistros("roteiro_itens"), todayInSaoPaulo());
}
