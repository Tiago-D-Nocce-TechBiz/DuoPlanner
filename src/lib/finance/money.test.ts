import { describe, expect, it } from "vitest";
import { convertCents, formatBRL, fromCents, roundMoney, splitAmount, sumCents, sumMoney, toCents } from "./money";

describe("toCents / fromCents", () => {
  it("converte sem o ruído do ponto flutuante", () => {
    expect(toCents(10.01)).toBe(1001);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
    expect(fromCents(1001)).toBe(10.01);
  });

  it("metade para longe do zero, inclusive onde Math.round(x * 100) erra", () => {
    // 1.005 * 100 = 100.49999999999999 em float: Math.round daria 100.
    expect(toCents(1.005)).toBe(101);
    expect(toCents(2.675)).toBe(268);
    expect(toCents(-1.005)).toBe(-101);
    expect(toCents(-0.005)).toBe(-1);
    expect(roundMoney(8.345)).toBe(8.35);
  });

  it("nunca devolve −0", () => {
    expect(Object.is(toCents(-0.004), 0)).toBe(true);
    expect(Object.is(fromCents(-0), 0)).toBe(true);
  });

  it("recusa valor que não é dinheiro", () => {
    expect(() => toCents(Number.NaN)).toThrow(RangeError);
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => toCents(1e15)).toThrow(/grande demais/);
    expect(() => fromCents(10.5)).toThrow(RangeError);
  });
});

describe("somas e conversão", () => {
  it("somar em centavos fecha a conta que o float não fecha", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array.from({ length: 1000 }, () => 0.01))).toBe(10);
    expect(sumMoney([10.01, -10.01])).toBe(0);
    expect(sumCents([1001, 999, -500])).toBe(1500);
    expect(() => sumCents([1.5])).toThrow(RangeError);
  });

  it("converte pela cotação e arredonda ao centavo", () => {
    expect(convertCents(1999, 5.4321)).toBe(10859);
    expect(convertCents(1, 0.5)).toBe(1);
    expect(convertCents(-1999, 5.4321)).toBe(-10859);
    expect(() => convertCents(100, 0)).toThrow(/Cotação inválida/);
    expect(() => convertCents(100, Number.NaN)).toThrow(RangeError);
  });

  it("formata em reais com separador de milhar", () => {
    expect(formatBRL(123456)).toMatch(/^R\$\s1\.234,56$/);
    expect(formatBRL(-501)).toMatch(/^-R\$\s5,01$/);
  });
});

describe("centavos ímpares: splitAmount", () => {
  it("R$ 10,01 dividido por 2 = R$ 5,01 e R$ 5,00", () => {
    expect(splitAmount(1001, 2)).toEqual([501, 500]);
  });

  it("o centavo que sobra vai para quem vem primeiro; as partes sempre fecham o total", () => {
    expect(splitAmount(100, 3)).toEqual([34, 33, 33]);
    expect(splitAmount(1, 3)).toEqual([1, 0, 0]);
    expect(splitAmount(0, 3)).toEqual([0, 0, 0]);
    expect(splitAmount(1001, [60, 40])).toEqual([601, 400]);
    expect(splitAmount(100, [1, 2])).toEqual([33, 67]);
    expect(splitAmount(999, [0, 100])).toEqual([0, 999]);
  });

  it("estorno (total negativo) divide pelo módulo e mantém o sinal", () => {
    expect(splitAmount(-1001, 2)).toEqual([-501, -500]);
    expect(splitAmount(-1, 2).map((v) => Object.is(v, -0))).toEqual([false, false]);
  });

  it("propriedade: soma exata e cada parte a menos de 1 centavo da fatia ideal", () => {
    // mulberry32: pseudoaleatório com semente fixa (o teste é reproduzível).
    let semente = 42;
    const aleatorio = () => {
      semente = (semente + 0x6d2b79f5) | 0;
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
    for (let rodada = 0; rodada < 2000; rodada++) {
      const total = Math.floor(aleatorio() * 2_000_000) - 1_000_000;
      const pesos = Array.from({ length: 1 + Math.floor(aleatorio() * 5) }, () => Math.round(aleatorio() * 10_000) / 100);
      if (!pesos.some((p) => p > 0)) pesos[0] = 1;
      const partes = splitAmount(total, pesos);
      const somaPesos = pesos.reduce((a, b) => a + b, 0);
      expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
      partes.forEach((parte, i) => {
        expect(Number.isSafeInteger(parte)).toBe(true);
        expect(Math.abs(parte - (total * pesos[i]) / somaPesos)).toBeLessThan(1);
      });
    }
  });

  it("para duas pessoas com percentual inteiro, a 1ª parte é o arredondamento comum", () => {
    // Equivalência com o cálculo anterior do acerto (Math.round(total × p / 100)).
    for (const p of [0, 1, 10, 25, 33, 50, 60, 67, 75, 99, 100]) {
      for (let total = 0; total <= 3000; total += 7) {
        expect(splitAmount(total, [p, 100 - p])[0]).toBe(Math.round((total * p) / 100));
      }
    }
  });

  it("recusa divisões sem sentido", () => {
    expect(() => splitAmount(100, 0)).toThrow(/partes inválido/);
    expect(() => splitAmount(100, 1.5)).toThrow(RangeError);
    expect(() => splitAmount(100, [])).toThrow(/ao menos uma parte/);
    expect(() => splitAmount(100, [-1, 2])).toThrow(/Peso inválido/);
    expect(() => splitAmount(100, [0, 0])).toThrow(/maior que zero/);
    expect(() => splitAmount(10.5, 2)).toThrow(/inteiro seguro/);
  });
});
