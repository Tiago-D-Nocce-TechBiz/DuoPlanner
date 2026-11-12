import { describe, expect, it } from "vitest";
import { emLotes, executarEmLotes, linhasParaIa, TAMANHO_LOTE_IA } from "./enriquecimento";
import { analisarFatura, enriquecerPeloDicionario } from "./invoice-analyzer";
import { reduzirRevisao, REVISAO_VAZIA, type EstadoRevisao } from "./revisao-fatura";

const HOJE = "2026-11-01";

const FATURA = [
  "date,title,amount",
  "2026-10-01,PG *UBER *TRIP,23.45", // marca do catálogo: reconhecida
  "2026-10-02,PADARIA DO ZE,12.30", // desconhecida: vai para a IA
  "2026-10-03,AUTO POSTO SAO JORGE,150.00", // palavra genérica: vai para a IA
  "2026-10-04,LOJA XYZ PARC 02/10,99.90", // desconhecida e parcelada
].join("\n");

function carregado(): EstadoRevisao {
  const { transacoes } = analisarFatura(FATURA, HOJE);
  const paraIa = linhasParaIa(transacoes, new Set());
  return reduzirRevisao(REVISAO_VAZIA, { tipo: "carregar", geracao: 1, transacoes, aguardandoIa: paraIa.map((l) => l.id) });
}

const iaDiz = (id: string, category: "Alimentação" | "Transporte" | "Compras") => ({
  id,
  cleanMerchantName: `Nome IA ${id}`,
  whatWasBought: "Algo",
  category,
  categoryIcon: "x",
  suggestedScope: "compartilhado" as const,
});

describe("catálogo local: reconhecido com certeza × genérico", () => {
  it("marca conhecida é reconhecida; palavra genérica mantém o nome da fatura e segue para a IA", () => {
    expect(enriquecerPeloDicionario("PG *UBER *TRIP", "Uber Trip")).toMatchObject({ cleanMerchantName: "Uber", reconhecido: true });
    expect(enriquecerPeloDicionario("AUTO POSTO SAO JORGE", "Auto Posto Sao Jorge")).toMatchObject({
      cleanMerchantName: "Auto Posto Sao Jorge",
      category: "Transporte",
      reconhecido: false,
    });
    expect(enriquecerPeloDicionario("PADARIA DO ZE", "Padaria Do Ze").reconhecido).toBe(false);
  });
});

describe("linhas que vão para a IA (etapa 2)", () => {
  it("só as não reconhecidas, fora as puladas, com os textos cortados nos limites do servidor", () => {
    const { transacoes } = analisarFatura(FATURA, HOJE);
    const paraIa = linhasParaIa(transacoes, new Set([transacoes[3].id]));
    expect(paraIa.map((l) => l.descricaoOriginal)).toEqual(["PADARIA DO ZE", "AUTO POSTO SAO JORGE"]);
    const longa = linhasParaIa([{ ...transacoes[1], descricaoOriginal: "x".repeat(500) }], new Set());
    expect(longa[0].descricaoOriginal).toHaveLength(300);
  });

  it("lotes de no máximo 40 linhas", () => {
    expect(emLotes(Array.from({ length: 95 }, (_, i) => i)).map((l) => l.length)).toEqual([TAMANHO_LOTE_IA, TAMANHO_LOTE_IA, 15]);
    expect(() => emLotes([1], 0)).toThrow(RangeError);
  });

  it("no máximo N lotes em paralelo, na ordem, e para de iniciar quando mandam parar", async () => {
    let emVoo = 0;
    let pico = 0;
    const iniciados: number[] = [];
    await executarEmLotes([1, 2, 3, 4, 5], 2, async (lote) => {
      iniciados.push(lote);
      emVoo++;
      pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
    });
    expect(pico).toBe(2);
    expect(iniciados).toEqual([1, 2, 3, 4, 5]);

    const feitos: number[] = [];
    let parar = false;
    await executarEmLotes(
      [1, 2, 3, 4, 5],
      1,
      async (lote) => {
        feitos.push(lote);
        if (lote === 2) parar = true;
      },
      () => parar
    );
    expect(feitos).toEqual([1, 2]);
  });
});

describe("revisão: respostas progressivas da IA", () => {
  it("cada lote atualiza só as suas linhas e tira o esqueleto delas", () => {
    const inicio = carregado();
    const [, padaria, posto, loja] = inicio.transacoes;
    expect([...inicio.aguardandoIa]).toEqual([padaria.id, posto.id, loja.id]);

    const depois = reduzirRevisao(inicio, { tipo: "enriquecer", geracao: 1, itens: [iaDiz(padaria.id, "Alimentação")], lote: [padaria.id, posto.id] });
    expect(depois.transacoes[1]).toMatchObject({ cleanMerchantName: `Nome IA ${padaria.id}`, category: "Alimentação", fonteEnriquecimento: "ia" });
    // O posto foi no lote mas a IA não o devolveu: fica com a categoria local, sem esqueleto.
    expect(depois.transacoes[2]).toBe(inicio.transacoes[2]);
    expect([...depois.aguardandoIa]).toEqual([loja.id]);
    // Linhas fora do lote mantêm a mesma referência (a linha memoizada não renderiza de novo).
    expect(depois.transacoes[0]).toBe(inicio.transacoes[0]);
  });

  it("a escolha feita à mão vence a resposta que chega depois", () => {
    const inicio = carregado();
    const padaria = inicio.transacoes[1].id;
    let estado = reduzirRevisao(inicio, { tipo: "categoria", id: padaria, category: "Compras" });
    estado = reduzirRevisao(estado, { tipo: "escopo", ids: [padaria], escopo: "pessoal_privado" });
    estado = reduzirRevisao(estado, { tipo: "enriquecer", geracao: 1, itens: [iaDiz(padaria, "Alimentação")], lote: [padaria] });
    expect(estado.transacoes[1]).toMatchObject({
      category: "Compras",
      suggestedScope: "pessoal_privado",
      cleanMerchantName: `Nome IA ${padaria}`, // o que a pessoa não mexeu, a IA melhora
    });
  });

  it("resposta de uma importação anterior (ou cancelada) é descartada", () => {
    const inicio = carregado();
    const padaria = inicio.transacoes[1].id;
    const nova = reduzirRevisao(inicio, { tipo: "limpar", geracao: 2 });
    expect(reduzirRevisao(nova, { tipo: "enriquecer", geracao: 1, itens: [iaDiz(padaria, "Alimentação")], lote: [padaria] })).toBe(nova);
    expect(reduzirRevisao(inicio, { tipo: "liberar", geracao: 9 })).toBe(inicio);
  });

  it("IA interrompida: as linhas restantes ficam com a categoria local", () => {
    const inicio = carregado();
    const parcial = reduzirRevisao(inicio, { tipo: "liberar", geracao: 1, ids: [inicio.transacoes[1].id] });
    expect(parcial.aguardandoIa.size).toBe(2);
    expect(reduzirRevisao(parcial, { tipo: "liberar", geracao: 1 }).aguardandoIa.size).toBe(0);
  });
});
