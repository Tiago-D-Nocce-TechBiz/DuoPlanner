import { describe, expect, it } from "vitest";
import { combina, indiceDeBusca, normalizarBusca } from "./busca";

describe("busca nas listas", () => {
  it("ignora acento, caixa e espaços repetidos", () => {
    expect(normalizarBusca("  Café   da MANHÃ ")).toBe("cafe da manha");
    expect(normalizarBusca("Ação Çé")).toBe("acao ce");
  });

  it("cada palavra do termo precisa aparecer, em qualquer ordem e em qualquer campo", () => {
    const indice = indiceDeBusca(["Padaria Central", "café da manhã", null, "Alimentação", "05/12/2026", "R$ 42,90"]);
    expect(combina(indice, normalizarBusca("cafe central"))).toBe(true);
    expect(combina(indice, normalizarBusca("CENTRAL café"))).toBe(true);
    expect(combina(indice, normalizarBusca("42,90"))).toBe(true);
    expect(combina(indice, normalizarBusca("12/2026"))).toBe(true);
    expect(combina(indice, normalizarBusca("cafe jantar"))).toBe(false);
  });

  it("termo vazio combina com tudo", () => {
    expect(combina("qualquer coisa", "")).toBe(true);
  });
});
