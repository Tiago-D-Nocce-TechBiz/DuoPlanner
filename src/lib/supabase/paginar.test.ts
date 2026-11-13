import { describe, expect, it, vi } from "vitest";
import { lerTodasAsPaginas, TAMANHO_PAGINA } from "./paginar";

/** "Banco" com `n` linhas de ids ordenáveis que responde como o PostgREST: no máximo `maxRows` por resposta. */
function banco(n: number, maxRows = 1000) {
  const linhas = Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(6, "0")}`, valor: i }));
  return vi.fn(async (depoisDe: string | null, tamanho: number) => {
    const resto = depoisDe ? linhas.filter((l) => l.id > depoisDe) : linhas;
    return { data: resto.slice(0, Math.min(tamanho, maxRows)), error: null as { message: string } | null };
  });
}

describe("lerTodasAsPaginas (keyset por id)", () => {
  it("página padrão abaixo do max_rows do Supabase", () => {
    expect(TAMANHO_PAGINA).toBeLessThanOrEqual(1000);
  });

  it("até 1000 linhas: uma consulta só, como antes", async () => {
    const buscar = banco(640);
    const r = await lerTodasAsPaginas(buscar);
    expect(r.data).toHaveLength(640);
    expect(r.incompleta).toBe(false);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledWith(null, 1000);
  });

  it("2.500 linhas: lê tudo (o limit(2000) antigo perdia 1.500 em silêncio)", async () => {
    const buscar = banco(2500);
    const r = await lerTodasAsPaginas(buscar);
    expect(r.data).toHaveLength(2500);
    expect(new Set(r.data.map((l) => l.id)).size).toBe(2500);
    expect(buscar.mock.calls.map((c) => c[0])).toEqual([null, "id-000999", "id-001999"]);
  });

  it("múltiplo exato do tamanho: a página vazia final encerra", async () => {
    const r = await lerTodasAsPaginas(banco(2000));
    expect(r.data).toHaveLength(2000);
    expect(r.incompleta).toBe(false);
  });

  it("erro numa página: devolve o que leu e o erro (quem chama decide)", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 3 }, (_, i) => ({ id: `a${i}` })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    const r = await lerTodasAsPaginas(buscar, { tamanho: 3 });
    expect(r.data).toHaveLength(3);
    expect(r.error).toEqual({ message: "timeout" });
    expect(r.incompleta).toBe(true);
  });

  it("limite de páginas: para e avisa (nada de laço infinito)", async () => {
    const r = await lerTodasAsPaginas(banco(50), { tamanho: 10, maxPaginas: 2 });
    expect(r.data).toHaveLength(20);
    expect(r.incompleta).toBe(true);
  });

  it("cursor que não avança: para em vez de repetir a página", async () => {
    const buscar = vi.fn(async () => ({ data: [{ id: "x" }, { id: "x" }], error: null }));
    const r = await lerTodasAsPaginas(buscar, { tamanho: 2 });
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(r.incompleta).toBe(true);
  });
});
