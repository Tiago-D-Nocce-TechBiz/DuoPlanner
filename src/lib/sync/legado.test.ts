import { describe, expect, it } from "vitest";
import { CHAVES_LEGADAS, contarDadosLegados, lerDadosLegados, removerLegado, totalLegado } from "./legado";

function storage(dados: Record<string, unknown>) {
  const mapa = new Map(Object.entries(dados).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return {
    getItem: (k: string) => mapa.get(k) ?? null,
    removeItem: (k: string) => void mapa.delete(k),
    tem: (k: string) => mapa.has(k),
  };
}

describe("dados salvos antes da sincronização", () => {
  it("lê, saneia e conta por área (dia do roteiro conta como item)", () => {
    const s = storage({
      [CHAVES_LEGADAS.despesas]: [
        { id: "a", data: "05/10/2026", estabelecimento: "Jantar", valor: 120, categoriaDestino: "Hospedagem", escopo: "viagem_compartilhado", origem: "Manual" },
        { id: "b", estabelecimento: "", valor: 10 }, // sem descrição: descartado
        { id: "c", estabelecimento: "Táxi", valor: "30" }, // valor não numérico: descartado
      ],
      [CHAVES_LEGADAS.roteiro]: [{ id: "d1", data: "2026-12-01", itens: [{ id: "i1", horario: "09:00", titulo: "Museu", nota: "" }] }],
      [CHAVES_LEGADAS.checklist]: [{ id: "k", texto: "Passaporte", feito: true, categoria: "Documentos" }],
      [CHAVES_LEGADAS.documentos]: [{ id: "x", tipo: "Passaporte", titular: "Ana", numero: "AB123456", observacao: "" }],
      [CHAVES_LEGADAS.alertas]: [{ id: "y", tipo: "voo", origem: "São Paulo", destino: "Lisboa", ida: "2026-12-01", volta: "", precoAlvo: "3000" }],
    });
    const dados = lerDadosLegados(s);
    expect(dados.despesas).toHaveLength(1);
    expect(contarDadosLegados(dados)).toEqual({ despesas: 1, roteiro: 2, checklist: 1, documentos: 1, alertas: 1 });
    expect(totalLegado(dados)).toBe(6);
  });

  it("JSON corrompido ou formato inesperado não quebra (vira vazio)", () => {
    const s = storage({ [CHAVES_LEGADAS.despesas]: "{não é json", [CHAVES_LEGADAS.roteiro]: { a: 1 } });
    expect(totalLegado(lerDadosLegados(s))).toBe(0);
  });

  it("remove só as áreas pedidas", () => {
    const s = storage({ [CHAVES_LEGADAS.despesas]: [], [CHAVES_LEGADAS.documentos]: [] });
    removerLegado(s, ["despesas"]);
    expect(s.tem(CHAVES_LEGADAS.despesas)).toBe(false);
    expect(s.tem(CHAVES_LEGADAS.documentos)).toBe(true);
  });
});
