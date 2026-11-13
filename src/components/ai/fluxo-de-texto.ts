/**
 * Ritmo do texto em fluxo das respostas da Nora (palavra por palavra, como
 * um modelo escrevendo). Puro, sem DOM: testado em `fluxo-de-texto.test.ts`.
 *
 * A Nora responde no aparelho (`responderNora`, sem IA remota), então a
 * resposta existe inteira desde o início: o fluxo só controla quanto dela
 * aparece. A duração total tem teto, para resposta longa não virar espera.
 */

export const PAUSA_ANTES_DA_RESPOSTA_MS = 400;
export const MS_POR_PALAVRA = 22;
export const DURACAO_MAXIMA_MS = 1200;

/** Índice logo depois de cada palavra: o texto é revelado sempre até um destes. */
export function finsDePalavra(texto: string): number[] {
  const fins: number[] = [];
  const palavra = /\S+/g;
  for (let m = palavra.exec(texto); m; m = palavra.exec(texto)) fins.push(m.index + m[0].length);
  return fins;
}

/** Milissegundos por palavra, encolhendo quando a resposta é longa (teto `maximoMs`). */
export function ritmoPorPalavra(palavras: number, msPorPalavra = MS_POR_PALAVRA, maximoMs = DURACAO_MAXIMA_MS): number {
  if (palavras <= 0) return msPorPalavra;
  return Math.min(msPorPalavra, maximoMs / palavras);
}

/** Quantos caracteres mostrar `decorridoMs` depois do início (a 1ª palavra sai na hora). */
export function caracteresVisiveis(fins: readonly number[], decorridoMs: number, msPorPalavra: number): number {
  if (fins.length === 0) return 0;
  const palavras = Math.min(fins.length, Math.floor(Math.max(0, decorridoMs) / msPorPalavra) + 1);
  return fins[palavras - 1];
}
