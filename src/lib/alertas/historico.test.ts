import { describe, expect, it } from "vitest";
import { geometriaDoGrafico, normalizarPontos, resumirHistorico, type PontoPreco } from "./historico";

const P = (dia: string, preco: number): PontoPreco => ({ dia, preco });

describe("normalizarPontos", () => {
  it("ordena por dia, mantém um ponto por dia (o último) e descarta lixo", () => {
    const r = normalizarPontos([P("2026-09-03", 900), P("2026-09-01", 1000), P("2026-09-03", 850), P("lixo", 5), P("2026-09-02", Number.NaN), P("2026-09-04", -1), P("2026-09-05", 0)]);
    expect(r).toEqual([P("2026-09-01", 1000), P("2026-09-03", 850)]);
  });
});

describe("resumirHistorico", () => {
  it("sem pontos, não há resumo", () => {
    expect(resumirHistorico([], 1000)).toBeNull();
  });

  it("um ponto: sem variação nem tendência, mas com o atual", () => {
    const r = resumirHistorico([P("2026-09-01", 1500)], null)!;
    expect(r).toMatchObject({ quantidade: 1, variacaoPct: null, tendencia: "estavel", noMenorPreco: false, diasNoAlvo: 0 });
    expect(r.atual).toEqual(P("2026-09-01", 1500));
  });

  it("menor, maior, variação desde o primeiro (1 casa) e tendência de queda", () => {
    const r = resumirHistorico([P("2026-09-01", 2000), P("2026-09-02", 1900), P("2026-09-03", 2100), P("2026-09-04", 1800)], 1850)!;
    expect(r.menor).toEqual(P("2026-09-04", 1800));
    expect(r.maior).toEqual(P("2026-09-03", 2100));
    expect(r.variacaoPct).toBe(-10);
    expect(r.tendencia).toBe("caindo");
    expect(r.noMenorPreco).toBe(true);
    expect(r.diasNoAlvo).toBe(1);
  });

  it("variação com casas decimais e subida", () => {
    const r = resumirHistorico([P("2026-09-01", 1000), P("2026-09-02", 1123.4)], null)!;
    expect(r.variacaoPct).toBe(12.3);
    expect(r.tendencia).toBe("subindo");
    expect(r.noMenorPreco).toBe(false);
  });

  it("variação pequena (menos de 1%) é estável", () => {
    expect(resumirHistorico([P("2026-09-01", 1000), P("2026-09-02", 1005)], null)!.tendencia).toBe("estavel");
  });

  it("dias no alvo contam o alvo exato e centavos sem erro de ponto flutuante", () => {
    const r = resumirHistorico([P("2026-09-01", 0.3), P("2026-09-02", 0.1 + 0.2), P("2026-09-03", 0.31)], 0.3)!;
    expect(r.diasNoAlvo).toBe(2);
  });

  it("empate no menor preço fica com o primeiro dia em que apareceu", () => {
    const r = resumirHistorico([P("2026-09-01", 900), P("2026-09-02", 1000), P("2026-09-03", 900)], null)!;
    expect(r.menor.dia).toBe("2026-09-01");
    expect(r.noMenorPreco).toBe(true);
  });
});

describe("geometriaDoGrafico", () => {
  it("sem pontos, nada", () => {
    expect(geometriaDoGrafico([], null, 320, 120)).toEqual({ linha: "", area: "", pontos: [], alvoY: null });
  });

  it("x proporcional aos dias, y invertido (menor preço embaixo) dentro das margens", () => {
    const g = geometriaDoGrafico([P("2026-09-01", 100), P("2026-09-03", 200), P("2026-09-11", 150)], null, 320, 120, 10);
    expect(g.pontos.map((p) => p.x)).toEqual([10, 10 + 0.2 * 300, 310]);
    expect(g.pontos[0].y).toBe(110); // menor: base
    expect(g.pontos[1].y).toBe(10); // maior: topo
    expect(g.alvoY).toBeNull();
    expect(g.linha.split(" ")).toHaveLength(3);
  });

  it("o alvo sempre cabe no gráfico, mesmo fora da faixa dos preços", () => {
    const g = geometriaDoGrafico([P("2026-09-01", 200), P("2026-09-02", 210)], 100, 320, 120, 10);
    expect(g.alvoY).toBe(110);
    expect(g.pontos.every((p) => p.y < 110)).toBe(true);
  });

  it("um ponto fica no centro e preços iguais não dividem por zero", () => {
    const g = geometriaDoGrafico([P("2026-09-01", 100)], null, 320, 120);
    expect(g.pontos[0].x).toBe(160);
    expect(Number.isFinite(g.pontos[0].y)).toBe(true);
    const plano = geometriaDoGrafico([P("2026-09-01", 100), P("2026-09-02", 100)], null, 320, 120);
    expect(plano.pontos.every((p) => Number.isFinite(p.y))).toBe(true);
  });
});
