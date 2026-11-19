import { describe, expect, it } from "vitest";
import { categoriaDoItem, custoEstimadoDoDia, formatarDataDoDia, lerCustoDigitado, ordenarDias, passaNoFiltro } from "./apresentacao";
import { FILTROS_ROTEIRO } from "./tipos";

describe("exibição do roteiro", () => {
  it("os filtros rápidos são Todos, Praia, Passeio, Gastronomia e Transporte", () => {
    expect([...FILTROS_ROTEIRO]).toEqual(["Todos", "Praia", "Passeio", "Gastronomia", "Transporte"]);
  });

  it("filtra por categoria; Todos mostra tudo, inclusive sem categoria", () => {
    expect(passaNoFiltro({ categoria: null }, "Todos")).toBe(true);
    expect(passaNoFiltro({ categoria: undefined }, "Todos")).toBe(true);
    expect(passaNoFiltro({ categoria: "Praia" }, "Praia")).toBe(true);
    expect(passaNoFiltro({ categoria: "Praia" }, "Passeio")).toBe(false);
    expect(passaNoFiltro({ categoria: null }, "Praia")).toBe(false);
  });

  it("ordena os dias por data (sem data por último, pela ordem do roteiro)", () => {
    const dias = [
      { id: "a", data: null, ordem: 0 },
      { id: "b", data: "2026-09-12", ordem: 1 },
      { id: "c", data: "2026-09-10", ordem: 2 },
      { id: "d", data: null, ordem: 3 },
      { id: "e", data: "2026-09-10", ordem: 1 },
    ];
    expect(ordenarDias(dias).map((d) => d.id)).toEqual(["e", "c", "b", "a", "d"]);
    expect(dias[0].id).toBe("a"); // não muda o original
  });

  it("soma o custo estimado do dia em centavos, sem erro de ponto flutuante", () => {
    expect(custoEstimadoDoDia([{ custoEstimado: 0.1 }, { custoEstimado: 0.2 }, { custoEstimado: null }, {}])).toBe(0.3);
    expect(custoEstimadoDoDia([])).toBe(0);
    expect(custoEstimadoDoDia([{ custoEstimado: 120 }, { custoEstimado: 25.5 }])).toBe(145.5);
  });

  it("formata a data com o dia da semana, ou 'Dia sem data'", () => {
    expect(formatarDataDoDia(null)).toBe("Dia sem data");
    expect(formatarDataDoDia("2026-09-10")).toMatch(/^qui\.?,? 10\/09\/2026$/);
  });

  it("categoria desconhecida do banco aparece como Outros", () => {
    expect(categoriaDoItem({ categoria: "Compras" })).toBe("Outros");
    expect(categoriaDoItem({ categoria: "Praia" })).toBe("Praia");
    expect(categoriaDoItem({ categoria: null })).toBe("");
  });

  it("campo de custo: vazio limpa, número vale, texto e valor fora do teto não", () => {
    expect(lerCustoDigitado("")).toBeNull();
    expect(lerCustoDigitado("12,50")).toBe(12.5);
    expect(lerCustoDigitado("R$ 80")).toBe(80);
    expect(lerCustoDigitado("12,")).toBe(12);
    expect(lerCustoDigitado("abc")).toBeUndefined();
    expect(lerCustoDigitado("12,345")).toBeUndefined();
    expect(lerCustoDigitado("2000000")).toBeUndefined();
    expect(lerCustoDigitado("-5")).toBeUndefined();
  });
});
