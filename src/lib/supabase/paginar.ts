/**
 * Leitura completa em páginas, por cursor na coluna `id` (keyset).
 *
 * O PostgREST corta cada resposta em `max_rows` (1000 no Supabase) sem dar
 * erro: um `.limit(2000)` devolvia 1000 linhas e o resto sumia em silêncio,
 * junto com os totais e o acerto calculados a partir delas. Aqui cada página
 * pede no máximo `tamanho` linhas em ordem de `id` e a próxima começa depois
 * do último `id` visto; a leitura termina quando uma página vem incompleta.
 *
 * Puro (sem Supabase): quem chama monta a consulta, com
 * `.order("id").gt("id", depoisDe).limit(tamanho)`.
 */

/** Abaixo do `max_rows` padrão do Supabase: cada página chega inteira. */
export const TAMANHO_PAGINA = 1000;

export interface PaginaLida<T, E> {
  data: T[] | null;
  error: E | null;
}

export interface LeituraCompleta<T, E> {
  data: T[];
  error: E | null;
  /** Parou no limite de páginas (dados demais para uma leitura só). */
  incompleta: boolean;
}

export async function lerTodasAsPaginas<T extends { id: unknown }, E>(
  buscarPagina: (depoisDe: string | null, tamanho: number) => PromiseLike<PaginaLida<T, E>>,
  { tamanho = TAMANHO_PAGINA, maxPaginas = 50 }: { tamanho?: number; maxPaginas?: number } = {}
): Promise<LeituraCompleta<T, E>> {
  if (!Number.isSafeInteger(tamanho) || tamanho < 1) throw new RangeError(`tamanho de página inválido: ${tamanho}`);
  const linhas: T[] = [];
  let depoisDe: string | null = null;
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const { data, error } = await buscarPagina(depoisDe, tamanho);
    if (error) return { data: linhas, error, incompleta: true };
    const lote = data ?? [];
    linhas.push(...lote);
    if (lote.length < tamanho) return { data: linhas, error: null, incompleta: false };
    const ultimo = lote[lote.length - 1].id;
    if (typeof ultimo !== "string" || ultimo === depoisDe) {
      // Sem cursor confiável (ou cursor parado): não repete a mesma página para sempre.
      return { data: linhas, error: null, incompleta: true };
    }
    depoisDe = ultimo;
  }
  return { data: linhas, error: null, incompleta: true };
}
