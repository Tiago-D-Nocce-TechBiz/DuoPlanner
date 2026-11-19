/**
 * Ordem manual do Roteiro. A tela mostra os dias por data (sem data por
 * último); quando vários dias têm a MESMA data, ou nenhum tem data, e dentro
 * de cada dia, vale a `ordem` que a dupla ajustou. Empate de `ordem` se
 * desfaz pelo id, para a lista nunca "pular" entre duas renderizações.
 */
export interface ComOrdem {
  id: string;
  ordem: number;
}

export const compararPorOrdem = (a: ComOrdem, b: ComOrdem): number => a.ordem - b.ordem || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Dias que disputam a mesma posição: os de mesma data (ou todos os sem data). */
export function diasDoMesmoGrupo<T extends { data: string | null }>(dias: readonly T[], dia: T): T[] {
  return dias.filter((d) => d.data === dia.data);
}

/**
 * Move `id` uma posição para cima (-1) ou para baixo (+1) dentro do grupo.
 * Devolve só as mudanças de `ordem` (vazio se já está na ponta). Reaproveita
 * os valores de `ordem` que o grupo já tinha, então os outros dias do
 * roteiro não são tocados; se o grupo tinha valores repetidos, renumera a
 * partir do menor.
 */
export function moverNoGrupo(grupo: readonly ComOrdem[], id: string, direcao: -1 | 1): { id: string; ordem: number }[] {
  const ordenado = [...grupo].sort(compararPorOrdem);
  const de = ordenado.findIndex((x) => x.id === id);
  const para = de + direcao;
  if (de < 0 || para < 0 || para >= ordenado.length) return [];
  const valores = ordenado.map((x) => x.ordem);
  const distintos = valores.every((v, i) => i === 0 || v > valores[i - 1]);
  const slots = distintos ? valores : valores.map((_, i) => valores[0] + i);
  const novo = [...ordenado];
  [novo[de], novo[para]] = [novo[para], novo[de]];
  return novo.flatMap((x, i) => (x.ordem === slots[i] ? [] : [{ id: x.id, ordem: slots[i] }]));
}
