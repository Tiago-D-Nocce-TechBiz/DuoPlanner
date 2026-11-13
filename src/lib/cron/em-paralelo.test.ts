import { describe, expect, it } from "vitest";
import { emParalelo } from "./em-paralelo";

describe("emParalelo", () => {
  it("processa todos os itens, nunca mais que o limite ao mesmo tempo", async () => {
    let ativos = 0;
    let pico = 0;
    const feitos: number[] = [];
    await emParalelo([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      ativos++;
      pico = Math.max(pico, ativos);
      await new Promise((ok) => setTimeout(ok, 5));
      feitos.push(n);
      ativos--;
    });
    expect(feitos.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pico).toBe(3);
  });

  it("lista vazia termina na hora", async () => {
    await expect(emParalelo([], 4, async () => {})).resolves.toBeUndefined();
  });

  it("limite inválido é erro de programação", async () => {
    await expect(emParalelo([1], 0, async () => {})).rejects.toThrow(RangeError);
  });
});
