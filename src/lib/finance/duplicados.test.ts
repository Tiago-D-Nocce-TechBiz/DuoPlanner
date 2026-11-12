import { describe, expect, it } from "vitest";
import { reconciliarImportacao, type GastoExistente, type LinhaImportada } from "./duplicados";

const EU = "eu";

const existente = (c: Partial<GastoExistente> & Pick<GastoExistente, "valor">): GastoExistente => ({
  data: "2026-10-05",
  moeda: "BRL",
  tipo: "gasto",
  descricao: "Uber",
  userId: EU,
  pagoPor: null,
  ...c,
});

const linha = (id: string, c: Partial<LinhaImportada> = {}): LinhaImportada => ({
  id,
  dataIso: "2026-10-05",
  valor: 10,
  moeda: "BRL",
  fingerprint: null,
  ...c,
});

describe("compras da fatura que já estão no DuoFinance (heurística)", () => {
  it("casa mesma data, moeda e valor ao centavo", () => {
    const r = reconciliarImportacao(
      [
        linha("l1", { valor: 23.45 }),
        linha("l2", { dataIso: "2026-10-06", valor: 23.45 }),
        linha("l3", { valor: 23.46 }),
        linha("l4", { valor: 23.45, moeda: "USD" }),
      ],
      [existente({ valor: 23.450000001 })],
      EU
    );
    expect([...r.entries()]).toEqual([["l1", { tipo: "parece_lancado", descricao: "Uber" }]]);
  });

  it("cada gasto existente cobre uma única linha da fatura", () => {
    const r = reconciliarImportacao(
      [linha("l1"), linha("l2"), linha("l3")],
      [existente({ valor: 10, descricao: "Metrô" }), existente({ valor: 10, descricao: "Metrô (volta)" })],
      EU
    );
    expect([...r.entries()].map(([id, m]) => [id, m.descricao])).toEqual([
      ["l1", "Metrô"],
      ["l2", "Metrô (volta)"],
    ]);
  });

  it("pagamentos do acerto e linhas corrompidas não contam como gasto lançado", () => {
    expect(reconciliarImportacao([linha("l1", { valor: 500 })], [existente({ valor: 500, tipo: "acerto" })], EU).size).toBe(0);
    expect(reconciliarImportacao([linha("l1")], [existente({ valor: Number.NaN })], EU).size).toBe(0);
  });

  it("fingerprint igual vence a heurística e só vale para os gastos da própria pessoa", () => {
    const fp = `v1:${"a".repeat(64)}`;
    const meu = existente({ valor: 99, descricao: "Importado antes", transactionFingerprint: fp });
    const doPar = existente({ valor: 99, descricao: "Do par", userId: "par", pagoPor: "par", transactionFingerprint: fp });
    expect(reconciliarImportacao([linha("l1", { valor: 99, fingerprint: fp })], [meu], EU).get("l1")).toEqual({
      tipo: "ja_importado",
      descricao: "Importado antes",
    });
    expect(reconciliarImportacao([linha("l1", { valor: 99, fingerprint: fp })], [doPar], EU).size).toBe(0);
  });
});
