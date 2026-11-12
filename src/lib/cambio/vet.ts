/**
 * "Qual cartão usar?" — custo efetivo de pagar no exterior (puro, testável).
 *
 * VET (Valor Efetivo Total) = quantos reais custa 1 unidade da moeda, já com
 * o spread de quem converte e o IOF:
 *
 *     VET = cotação comercial × (1 + spread) × (1 + IOF)
 *
 * Desde julho de 2025 o IOF de câmbio para gastos no exterior é o mesmo nos
 * três meios comparados: 3,5% no cartão (crédito, débito e pré-pago), na
 * remessa para conta própria no exterior (conta global) e na compra de
 * moeda em espécie. O que muda entre eles é o spread que cada instituição
 * cobra sobre o câmbio comercial, por isso o spread é editável na tela: os
 * padrões abaixo são estimativas de mercado, não o preço de um banco.
 */

import { convertCents, fromCents, toCents } from "@/lib/finance/money";

export const IOF_CAMBIO = 0.035;

export type MeioPagamento = "cartao" | "conta_global" | "especie";

export interface InfoMeio {
  id: MeioPagamento;
  nome: string;
  /** Spread estimado sobre o câmbio comercial, em %. */
  spreadPadrao: number;
  /** Prós e contras em uma frase (exibidos no comparador). */
  resumo: string;
}

export const MEIOS_PAGAMENTO: readonly InfoMeio[] = [
  {
    id: "cartao",
    nome: "Cartão de Crédito Tradicional",
    spreadPadrao: 5,
    resumo: "Prático e aceito em quase todo lugar. O banco converte com a cotação própria (spread maior) e soma o IOF.",
  },
  {
    id: "conta_global",
    nome: "Conta Global Internacional",
    spreadPadrao: 1.5,
    resumo: "Você converte antes, com spread menor, e paga no débito em moeda local. Precisa abrir a conta e carregar o saldo.",
  },
  {
    id: "especie",
    nome: "Espécie (dinheiro)",
    spreadPadrao: 4,
    resumo: "Bom para gorjetas e lugares que não aceitam cartão. Casas de câmbio cobram spread maior, e a sobra perde de novo ao reconverter.",
  },
];

export const SPREAD_MAXIMO = 30;

export interface ResultadoMeio {
  id: MeioPagamento;
  nome: string;
  spread: number;
  /** Reais por 1 unidade da moeda (com spread e IOF). */
  vet: number;
  totalReais: number;
  /** Quanto custa a mais que o câmbio comercial puro. */
  custoExtra: number;
  /** Mesmo custo, em % sobre o comercial. */
  percentualExtra: number;
}

export interface ComparacaoVet {
  /** Do mais barato para o mais caro. */
  resultados: ResultadoMeio[];
  /** Diferença entre o mais caro e o mais barato, em reais. */
  economiaMaxima: number;
}

/** Acima disso o comparador não calcula (valor digitado por engano). */
export const VALOR_MAXIMO_VET = 1_000_000_000;

export function compararMeios(
  valorMoeda: number,
  cotacaoComercial: number,
  spreads: Partial<Record<MeioPagamento, number>> = {},
  iof: number = IOF_CAMBIO
): ComparacaoVet {
  const valido = (v: number, maximo: number) => Number.isFinite(v) && v > 0 && v <= maximo;
  // Limites que mantêm valor × cotação em centavos inteiros seguros.
  if (!valido(valorMoeda, VALOR_MAXIMO_VET) || !valido(cotacaoComercial, 1_000) || !Number.isFinite(iof) || iof < 0 || iof > 1) {
    return { resultados: [], economiaMaxima: 0 };
  }
  // Em centavos: o total de cada meio e as diferenças entre eles fecham.
  const quantia = toCents(valorMoeda);
  const comercial = convertCents(quantia, cotacaoComercial);
  const resultados = MEIOS_PAGAMENTO.map((meio) => {
    const bruto = spreads[meio.id];
    const spread = Number.isFinite(bruto) ? Math.min(SPREAD_MAXIMO, Math.max(0, bruto as number)) : meio.spreadPadrao;
    const vet = cotacaoComercial * (1 + spread / 100) * (1 + iof);
    const total = convertCents(quantia, vet);
    return {
      id: meio.id,
      nome: meio.nome,
      spread,
      vet,
      totalReais: fromCents(total),
      custoExtra: fromCents(total - comercial),
      percentualExtra: Math.round(((vet / cotacaoComercial - 1) * 100) * 10) / 10,
    };
  }).sort((a, b) => a.totalReais - b.totalReais);

  return {
    resultados,
    economiaMaxima: fromCents(toCents(resultados[resultados.length - 1].totalReais) - toCents(resultados[0].totalReais)),
  };
}
