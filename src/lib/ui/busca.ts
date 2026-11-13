/**
 * Busca em listas na tela (sem servidor): sem acento, sem caixa e por
 * palavras. "cafe centro" acha "Café do Centro" e "Centro — café da manhã".
 * Pura: testada em `busca.test.ts`.
 *
 * O índice de cada item é montado uma vez por mudança na lista
 * (`indiceDeBusca`); a cada pausa na digitação só roda o `combina`.
 */

export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto pesquisável de um item a partir dos campos que a pessoa enxerga. */
export function indiceDeBusca(campos: readonly (string | null | undefined)[]): string {
  return normalizarBusca(campos.filter((c): c is string => typeof c === "string" && c.length > 0).join(" "));
}

/** Toda palavra do termo (já normalizado) aparece no índice, em qualquer ordem. */
export function combina(indice: string, termoNormalizado: string): boolean {
  if (!termoNormalizado) return true;
  return termoNormalizado.split(" ").every((palavra) => indice.includes(palavra));
}
