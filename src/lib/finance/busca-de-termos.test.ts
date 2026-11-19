import { describe, expect, it } from "vitest";
import { criarBuscaDeTermos } from "./busca-de-termos";

/** A varredura linear que a busca substitui (a referência de correção). */
const varredura = (entradas: string[][], texto: string) => entradas.findIndex((termos) => termos.some((t) => texto.includes(t)));

const normal = (...palavras: string[]) => ` ${palavras.join(" ")} `;

/** Gerador determinístico (mulberry32): o teste é sempre o mesmo. */
function sorteador(semente: number) {
  let a = semente;
  return (n: number) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

describe("criarBuscaDeTermos", () => {
  it("vence a entrada de menor posição, não o termo mais longo nem o que aparece antes no texto", () => {
    const entradas = [[normal("uber", "eats")], [normal("uber")], [normal("eats")]];
    const busca = criarBuscaDeTermos(entradas);
    expect(busca(normal("pg", "uber", "eats", "sp"))).toBe(0);
    expect(busca(normal("uber", "trip"))).toBe(1);
    expect(busca(normal("eats", "uber"))).toBe(1); // "uber eats" exige a ordem
    expect(busca(normal("nada", "aqui"))).toBe(-1);
  });

  it("só palavras inteiras: 'ubereats' não é 'uber', e o termo do meio do texto também conta", () => {
    const busca = criarBuscaDeTermos([[normal("uber")], [normal("posto", "shell")]]);
    expect(busca(normal("ubereats"))).toBe(-1);
    expect(busca(normal("auto", "posto", "shell", "br"))).toBe(1);
  });

  it("termo vazio nunca casa", () => {
    expect(criarBuscaDeTermos([["  "], [normal("x")]])(normal("x"))).toBe(1);
  });

  it("igual à varredura linear em 20 mil casos sorteados (vocabulário pequeno, muitos empates)", () => {
    const sortear = sorteador(20261117);
    const vocabulario = Array.from({ length: 24 }, (_, i) => `p${i}`);
    for (let caso = 0; caso < 400; caso++) {
      const entradas = Array.from({ length: 1 + sortear(30) }, () =>
        Array.from({ length: 1 + sortear(4) }, () => normal(...Array.from({ length: 1 + sortear(3) }, () => vocabulario[sortear(24)])))
      );
      const busca = criarBuscaDeTermos(entradas);
      for (let i = 0; i < 50; i++) {
        const texto = normal(...Array.from({ length: 1 + sortear(9) }, () => vocabulario[sortear(24)]));
        expect(busca(texto), `entradas ${JSON.stringify(entradas)} | texto "${texto}"`).toBe(varredura(entradas, texto));
      }
    }
  });
});
