/**
 * Dinheiro em CENTAVOS inteiros (puro; roda no navegador e no servidor).
 *
 * Ponto flutuante não representa 0,10 exatamente: somar reais em float
 * acumula erro (0,1 + 0,2 = 0,30000000000000004) e `Math.round(1.005 * 100)`
 * dá 100, não 101. Toda conta de dinheiro passa por aqui: o valor vira
 * centavos uma vez, a soma, a divisão e a conversão são feitas em inteiros, e
 * só no fim ele volta a reais para exibir ou gravar.
 *
 * O modelo persistido continua em reais (`numeric(12,2)` no Postgres, que é
 * decimal exato); a regra é não fazer aritmética com esses números sem
 * passar por este módulo.
 *
 * Arredondamento: metade para longe do zero (1,005 → 1,01; −1,005 → −1,01),
 * o mesmo das calculadoras e dos extratos. Divisão entre pessoas: método do
 * maior resto, então as partes SEMPRE somam o total (R$ 10,01 ÷ 2 = 5,01 + 5,00).
 */

/** Centavos inteiros (seguros até Number.MAX_SAFE_INTEGER). */
export type Cents = number;

/** Escala dos pesos de `splitAmount` (percentuais com até 6 casas). */
const ESCALA_PESO = 1_000_000;
// BigInt(…) em vez de literais 0n/1n: o tsconfig mira ES2017.
const ZERO = BigInt(0);
const UM = BigInt(1);

function falhar(mensagem: string): never {
  throw new RangeError(mensagem);
}

/** −0 vira 0 (evita "-R$ 0,00" e `Object.is` diferente nos testes). */
const semZeroNegativo = (n: number) => (n === 0 ? 0 : n);

/**
 * Arredonda para o inteiro mais próximo, metade para longe do zero.
 * `toPrecision(15)` tira o ruído binário da multiplicação anterior
 * (100.49999999999999 → 100.5) sem mexer em valores legítimos: exato para
 * |x| < 1e14 (valores em reais abaixo de 1 trilhão).
 */
function arredondarInteiro(x: number): number {
  if (!Number.isFinite(x)) falhar(`Valor monetário inválido: ${x}.`);
  const modulo = Math.abs(x);
  // Caminho rápido, com o MESMO resultado: `toPrecision(15)` só muda o valor
  // na 15ª casa significativa (erro < 1e-6 abaixo de 1e9), então só decide
  // algo quando a fração está colada em ".5". Longe disso (a imensa maioria:
  // 1234.56 * 100 = 123456.00000000001), `Math.round` já dá a resposta, sem
  // criar a string de `toPrecision` e sem reler o número. Equivalência
  // conferida em `money.test.ts` contra a versão com `toPrecision`.
  if (modulo < 1e9 && Math.abs(modulo - Math.floor(modulo) - 0.5) > 1e-5) {
    const r = Math.round(modulo);
    return semZeroNegativo(x < 0 ? -r : r);
  }
  const absoluto = Math.round(Number(modulo.toPrecision(15)));
  if (absoluto > Number.MAX_SAFE_INTEGER) falhar(`Valor monetário grande demais: ${x}.`);
  return semZeroNegativo(x < 0 ? -absoluto : absoluto);
}

function exigirCentavos(valor: number, nome = "centavos"): void {
  if (!Number.isSafeInteger(valor)) falhar(`${nome} precisa ser um inteiro seguro (recebido: ${valor}).`);
}

/** Reais → centavos (10.01 → 1001). Lança RangeError para NaN/Infinity. */
export function toCents(reais: number): Cents {
  return arredondarInteiro(reais * 100);
}

/** Centavos → reais (1001 → 10.01). */
export function fromCents(cents: Cents): number {
  exigirCentavos(cents);
  return semZeroNegativo(cents / 100);
}

/** Arredonda um valor em reais ao centavo (2.675 → 2.68). */
export function roundMoney(reais: number): number {
  return fromCents(toCents(reais));
}

/** Soma exata de centavos. */
export function sumCents(valores: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of valores) {
    exigirCentavos(v);
    total += v;
  }
  exigirCentavos(total, "soma");
  return total;
}

/** Soma de valores em REAIS, feita em centavos: devolve reais (0.1 + 0.2 = 0.3). */
export function sumMoney(reais: Iterable<number>): number {
  let total = 0;
  for (const v of reais) total += toCents(v);
  exigirCentavos(total, "soma");
  return fromCents(total);
}

/**
 * Converte centavos de uma moeda para centavos de outra pela cotação
 * (ex.: US$ 19,99 a 5,4321 → R$ 108,59). Cotação precisa ser > 0.
 */
export function convertCents(cents: Cents, cotacao: number): Cents {
  exigirCentavos(cents);
  if (!Number.isFinite(cotacao) || cotacao <= 0) falhar(`Cotação inválida: ${cotacao}.`);
  return arredondarInteiro(cents * cotacao);
}

/**
 * Divide `totalCents` em partes que somam exatamente o total.
 *
 * `ratio` é o número de partes iguais (2 → metade para cada) ou a lista de
 * pesos (ex.: [60, 40], [1, 2]; percentuais com até 6 casas). Método do maior
 * resto: cada parte recebe o piso da sua fatia e os centavos que sobram vão,
 * um a um, para as maiores frações; no empate, para a parte de menor índice
 * (a primeira da lista). Total negativo (estorno) é dividido pelo módulo e
 * volta com sinal.
 *
 *   splitAmount(1001, 2)        → [501, 500]
 *   splitAmount(100, 3)         → [34, 33, 33]
 *   splitAmount(1001, [60, 40]) → [601, 400]
 *   splitAmount(-1001, 2)       → [-501, -500]
 */
export function splitAmount(totalCents: Cents, ratio: number | readonly number[]): Cents[] {
  exigirCentavos(totalCents, "totalCents");
  let pesos: readonly number[];
  if (typeof ratio === "number") {
    if (!Number.isSafeInteger(ratio) || ratio < 1) falhar(`Número de partes inválido: ${ratio}.`);
    pesos = Array.from({ length: ratio }, () => 1);
  } else {
    pesos = ratio;
  }
  if (pesos.length === 0) falhar("Informe ao menos uma parte.");

  const escalados = pesos.map((p) => {
    if (!Number.isFinite(p) || p < 0) falhar(`Peso inválido: ${p}.`);
    return BigInt(Math.round(p * ESCALA_PESO));
  });
  const somaPesos = escalados.reduce((a, b) => a + b, ZERO);
  if (somaPesos === ZERO) falhar("A soma dos pesos precisa ser maior que zero.");

  // BigInt: total × peso não estoura nem perde precisão.
  const total = BigInt(Math.abs(totalCents));
  const partes = escalados.map((w) => (total * w) / somaPesos);
  const restos = escalados.map((w, indice) => ({ indice, resto: (total * w) % somaPesos }));
  const distribuido = partes.reduce((a, b) => a + b, ZERO);
  const sobra = Number(total - distribuido); // sempre < número de partes

  restos.sort((a, b) => (a.resto === b.resto ? a.indice - b.indice : a.resto > b.resto ? -1 : 1));
  for (let k = 0; k < sobra; k++) partes[restos[k].indice] += UM;

  const sinal = totalCents < 0 ? -1 : 1;
  return partes.map((p) => semZeroNegativo(sinal * Number(p)));
}

const FORMATO_BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos → "R$ 1.234,56" (com separador de milhar). */
export function formatBRL(cents: Cents): string {
  return FORMATO_BRL.format(fromCents(cents));
}
