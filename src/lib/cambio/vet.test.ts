import { describe, expect, it } from "vitest";
import { compararMeios, IOF_CAMBIO } from "./vet";

describe("Qual cartão usar? (VET)", () => {
  it("calcula o VET com spread e IOF e ordena do mais barato ao mais caro", () => {
    const { resultados, economiaMaxima } = compararMeios(1000, 5, { cartao: 5, conta_global: 2, especie: 4 });
    expect(resultados.map((r) => r.id)).toEqual(["conta_global", "especie", "cartao"]);
    const [global, especie, cartao] = resultados;
    expect(global.vet).toBeCloseTo(5 * 1.02 * (1 + IOF_CAMBIO), 10);
    expect(global.totalReais).toBe(5278.5);
    expect(especie.totalReais).toBe(5382);
    expect(cartao.totalReais).toBe(5433.75);
    expect(cartao.custoExtra).toBe(433.75);
    expect(cartao.percentualExtra).toBe(8.7);
    expect(economiaMaxima).toBe(155.25);
  });

  it("usa o spread padrão quando não informado e limita valores absurdos", () => {
    const { resultados } = compararMeios(100, 5.4, { cartao: -3, especie: 999 });
    const porId = Object.fromEntries(resultados.map((r) => [r.id, r]));
    expect(porId.cartao.spread).toBe(0);
    expect(porId.especie.spread).toBe(30);
    expect(porId.conta_global.spread).toBe(1.5);
  });

  it("sem valor ou sem cotação não compara", () => {
    expect(compararMeios(0, 5).resultados).toEqual([]);
    expect(compararMeios(100, 0).resultados).toEqual([]);
    expect(compararMeios(Number.NaN, 5).resultados).toEqual([]);
  });
});
