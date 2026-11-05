import { describe, expect, it } from "vitest";
import { encontrarJaLancados, type GastoExistente } from "./duplicados";

const existente = (c: Partial<GastoExistente> & Pick<GastoExistente, "valor">): GastoExistente => ({
  data: "2026-10-05",
  moeda: "BRL",
  tipo: "gasto",
  descricao: "Uber",
  ...c,
});

describe("compras da fatura que já estão no DuoFinance", () => {
  it("casa mesma data, moeda e valor ao centavo", () => {
    const r = encontrarJaLancados(
      [
        { id: "l1", dataIso: "2026-10-05", valor: 23.45, moeda: "BRL" },
        { id: "l2", dataIso: "2026-10-06", valor: 23.45, moeda: "BRL" },
        { id: "l3", dataIso: "2026-10-05", valor: 23.46, moeda: "BRL" },
        { id: "l4", dataIso: "2026-10-05", valor: 23.45, moeda: "USD" },
      ],
      [existente({ valor: 23.450000001 })]
    );
    expect([...r.entries()]).toEqual([["l1", "Uber"]]);
  });

  it("cada gasto existente cobre uma única linha da fatura", () => {
    const linhas = [
      { id: "l1", dataIso: "2026-10-05", valor: 10, moeda: "BRL" },
      { id: "l2", dataIso: "2026-10-05", valor: 10, moeda: "BRL" },
      { id: "l3", dataIso: "2026-10-05", valor: 10, moeda: "BRL" },
    ];
    const r = encontrarJaLancados(linhas, [existente({ valor: 10, descricao: "Metrô" }), existente({ valor: 10, descricao: "Metrô (volta)" })]);
    expect([...r.entries()]).toEqual([
      ["l1", "Metrô"],
      ["l2", "Metrô (volta)"],
    ]);
  });

  it("pagamentos do acerto não contam como gasto lançado", () => {
    const r = encontrarJaLancados([{ id: "l1", dataIso: "2026-10-05", valor: 500, moeda: "BRL" }], [existente({ valor: 500, tipo: "acerto" })]);
    expect(r.size).toBe(0);
  });
});
