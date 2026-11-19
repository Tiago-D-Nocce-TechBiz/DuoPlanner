import { daysBetween } from "@/lib/dates";
import { roundMoney, toCents } from "@/lib/finance/money";

/**
 * Histórico de preços de um Alerta (puro: roda no navegador e no servidor).
 * Um ponto por dia, em reais. Os números do resumo saem de centavos inteiros,
 * sem erro de ponto flutuante.
 */
export interface PontoPreco {
  /** AAAA-MM-DD */
  dia: string;
  preco: number;
}

export type Tendencia = "caindo" | "subindo" | "estavel";

export interface ResumoHistorico {
  quantidade: number;
  atual: PontoPreco;
  menor: PontoPreco;
  maior: PontoPreco;
  primeiro: PontoPreco;
  /** Variação do atual em relação ao primeiro registro, em % com 1 casa (negativo = caiu); null se o primeiro é o atual. */
  variacaoPct: number | null;
  /** Atual contra a média dos até 3 registros anteriores (limiar de 1%). */
  tendencia: Tendencia;
  /** Dias em que o preço ficou no alvo ou abaixo. */
  diasNoAlvo: number;
  /** O preço de hoje é o menor já visto (e há mais de um registro)? */
  noMenorPreco: boolean;
}

/** Ordena por dia e mantém um ponto por dia (o último que chegou). */
export function normalizarPontos(pontos: readonly PontoPreco[]): PontoPreco[] {
  const porDia = new Map<string, number>();
  for (const p of pontos) if (/^\d{4}-\d{2}-\d{2}$/.test(p.dia) && Number.isFinite(p.preco) && p.preco > 0) porDia.set(p.dia, p.preco);
  return [...porDia.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([dia, preco]) => ({ dia, preco }));
}

export function resumirHistorico(brutos: readonly PontoPreco[], precoAlvo: number | null): ResumoHistorico | null {
  const pontos = normalizarPontos(brutos);
  if (pontos.length === 0) return null;
  const primeiro = pontos[0];
  const atual = pontos[pontos.length - 1];
  const menor = pontos.reduce((m, p) => (toCents(p.preco) < toCents(m.preco) ? p : m));
  const maior = pontos.reduce((m, p) => (toCents(p.preco) > toCents(m.preco) ? p : m));

  let tendencia: Tendencia = "estavel";
  if (pontos.length > 1) {
    const anteriores = pontos.slice(Math.max(0, pontos.length - 4), -1);
    const media = anteriores.reduce((s, p) => s + toCents(p.preco), 0) / anteriores.length;
    const razao = (toCents(atual.preco) - media) / media;
    tendencia = razao <= -0.01 ? "caindo" : razao >= 0.01 ? "subindo" : "estavel";
  }
  const alvoEmCentavos = precoAlvo !== null ? toCents(precoAlvo) : null;
  return {
    quantidade: pontos.length,
    atual,
    menor,
    maior,
    primeiro,
    variacaoPct:
      pontos.length > 1 ? Math.round(((toCents(atual.preco) - toCents(primeiro.preco)) / toCents(primeiro.preco)) * 1000) / 10 : null,
    tendencia,
    diasNoAlvo: alvoEmCentavos === null ? 0 : pontos.filter((p) => toCents(p.preco) <= alvoEmCentavos).length,
    noMenorPreco: pontos.length > 1 && toCents(atual.preco) === toCents(menor.preco),
  };
}

export interface GeometriaDoGrafico {
  /** Pontos do SVG `points`/`d` (linha do preço). */
  linha: string;
  /** Área sob a linha (fechada na base), para o preenchimento. */
  area: string;
  /** Posição de cada ponto (para marcar o último e o menor). */
  pontos: { x: number; y: number; dia: string; preco: number }[];
  /** Altura (y) da linha do alvo, ou null se não há alvo. */
  alvoY: number | null;
}

/** Coordenadas do gráfico: x proporcional aos dias corridos, y com o alvo sempre visível. */
export function geometriaDoGrafico(
  brutos: readonly PontoPreco[],
  precoAlvo: number | null,
  largura: number,
  altura: number,
  margem = 8
): GeometriaDoGrafico {
  const pontos = normalizarPontos(brutos);
  if (pontos.length === 0) return { linha: "", area: "", pontos: [], alvoY: null };
  const valores = pontos.map((p) => p.preco).concat(precoAlvo !== null ? [precoAlvo] : []);
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const faixa = maximo - minimo || 1;
  const util = { w: Math.max(1, largura - margem * 2), h: Math.max(1, altura - margem * 2) };
  const dias = pontos.length > 1 ? daysBetween(pontos[0].dia, pontos[pontos.length - 1].dia) || 1 : 1;
  const y = (preco: number) => roundMoney(margem + util.h - ((preco - minimo) / faixa) * util.h);
  const xs = pontos.map((p) => (pontos.length === 1 ? largura / 2 : roundMoney(margem + (daysBetween(pontos[0].dia, p.dia) / dias) * util.w)));
  const marcados = pontos.map((p, i) => ({ x: xs[i], y: y(p.preco), dia: p.dia, preco: p.preco }));
  const linha = marcados.map((p) => `${p.x},${p.y}`).join(" ");
  const base = altura - margem;
  return {
    linha,
    area: `${marcados[0].x},${base} ${linha} ${marcados[marcados.length - 1].x},${base}`,
    pontos: marcados,
    alvoY: precoAlvo !== null ? y(precoAlvo) : null,
  };
}
