import { describe, expect, it } from "vitest";
import { caracteresVisiveis, DURACAO_MAXIMA_MS, finsDePalavra, MS_POR_PALAVRA, ritmoPorPalavra } from "./fluxo-de-texto";

describe("fluxo de texto da Nora", () => {
  it("revela sempre até o fim de uma palavra (nunca meia palavra)", () => {
    const texto = "Olá, Ana!  Vamos montar a busca?";
    const fins = finsDePalavra(texto);
    expect(fins.map((f) => texto.slice(0, f))).toEqual([
      "Olá,",
      "Olá, Ana!",
      "Olá, Ana!  Vamos",
      "Olá, Ana!  Vamos montar",
      "Olá, Ana!  Vamos montar a",
      "Olá, Ana!  Vamos montar a busca?",
    ]);
  });

  it("a 1ª palavra sai na hora; depois, uma a cada `ms` por palavra; no fim, o texto todo", () => {
    const fins = finsDePalavra("um dois três");
    expect(caracteresVisiveis(fins, 0, 20)).toBe(2);
    expect(caracteresVisiveis(fins, 19, 20)).toBe(2);
    expect(caracteresVisiveis(fins, 20, 20)).toBe(7);
    expect(caracteresVisiveis(fins, 10_000, 20)).toBe(12);
    expect(caracteresVisiveis([], 50, 20)).toBe(0);
  });

  it("resposta longa encolhe o ritmo: a duração total nunca passa do teto", () => {
    expect(ritmoPorPalavra(10)).toBe(MS_POR_PALAVRA);
    const palavras = 300;
    const ms = ritmoPorPalavra(palavras);
    expect(ms * palavras).toBeLessThanOrEqual(DURACAO_MAXIMA_MS);
    const fins = finsDePalavra(Array.from({ length: palavras }, (_, i) => `p${i}`).join(" "));
    expect(caracteresVisiveis(fins, DURACAO_MAXIMA_MS, ms)).toBe(fins.at(-1));
  });
});
