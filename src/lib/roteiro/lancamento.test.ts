import { describe, expect, it } from "vitest";
import { z } from "zod";
import { categoriaFinanceira, idDoLancamento, itensLancaveis, jaLancado, montarLancamentos, uuidDeterministico } from "./lancamento";

const EU = "11111111-1111-4111-8111-111111111111";
const PAR = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

describe("id determinístico do lançamento", () => {
  it("é um UUID aceito pela validação do servidor (z.uuid) e estável", () => {
    const id = idDoLancamento(ITEM, "compartilhado", EU);
    expect(z.uuid().safeParse(id).success).toBe(true);
    expect(idDoLancamento(ITEM, "compartilhado", EU)).toBe(id);
    expect(uuidDeterministico("x")).toBe(uuidDeterministico("x"));
    expect(uuidDeterministico("x")).not.toBe(uuidDeterministico("y"));
  });

  it("compartilhado não depende de quem lança; privado depende da pessoa", () => {
    expect(idDoLancamento(ITEM, "compartilhado", EU)).toBe(idDoLancamento(ITEM, "compartilhado", PAR));
    expect(idDoLancamento(ITEM, "privado", EU)).not.toBe(idDoLancamento(ITEM, "privado", PAR));
    expect(idDoLancamento(ITEM, "privado", EU)).not.toBe(idDoLancamento(ITEM, "compartilhado", EU));
  });
});

describe("já lançado", () => {
  it("vale o gasto compartilhado de qualquer um ou o privado da própria pessoa", () => {
    const compartilhado = new Set([idDoLancamento(ITEM, "compartilhado", PAR)]);
    expect(jaLancado(ITEM, EU, compartilhado)).toBe(true); // o par lançou: a dupla vê, não repete
    const privadoDoPar = new Set([idDoLancamento(ITEM, "privado", PAR)]);
    expect(jaLancado(ITEM, EU, privadoDoPar)).toBe(false); // privado do par é invisível e não conta
    expect(jaLancado(ITEM, PAR, privadoDoPar)).toBe(true);
    expect(jaLancado(ITEM, EU, new Set())).toBe(false);
  });

  it("só aparece como lançável quem tem custo maior que zero e ainda não virou gasto", () => {
    const itens = [
      { id: "a", custoEstimado: 10 },
      { id: "b", custoEstimado: 0 },
      { id: "c", custoEstimado: null },
      { id: "d", custoEstimado: 5 },
    ];
    const gastos = new Set([idDoLancamento("d", "privado", EU)]);
    expect(itensLancaveis(itens, EU, gastos).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("montarLancamentos", () => {
  const base = { escopo: "compartilhado" as const, dataDoDia: "2026-09-10", hojeIso: "2026-05-01", destino: "Lisboa", userId: EU };

  it("um gasto por atividade, em reais, com categoria do app, escopo e data do dia", () => {
    const r = montarLancamentos({
      ...base,
      itens: [
        { item: { id: "a", titulo: "Jantar", categoria: "Gastronomia" }, valor: 120.5 },
        { item: { id: "b", titulo: "Táxi", categoria: "Transporte" }, valor: 45 },
      ],
    });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      descricao: "Jantar (Roteiro · Lisboa)",
      valor: 120.5,
      moeda: "BRL",
      data: "2026-09-10",
      categoria: "Alimentação & Gastronomia",
      escopo: "viagem_compartilhado",
      origem: "manual",
    });
    expect(r[1].categoria).toBe("Passagens & Transporte");
    expect(r[0].id).toBe(idDoLancamento("a", "compartilhado", EU));
  });

  it("dia sem data usa hoje; privado vira pessoal_privado com id da pessoa", () => {
    const [g] = montarLancamentos({ ...base, escopo: "privado", dataDoDia: null, itens: [{ item: { id: "a", titulo: "", categoria: null }, valor: 10 }] });
    expect(g).toMatchObject({ data: "2026-05-01", escopo: "pessoal_privado", descricao: "Atividade do roteiro (Roteiro · Lisboa)" });
    expect(g.id).toBe(idDoLancamento("a", "privado", EU));
  });

  it("descarta valor zero, negativo, infinito ou acima do teto; encurta a descrição", () => {
    const itens = [0, -5, Number.NaN, Infinity, 1_000_001, 1].map((valor, i) => ({ item: { id: `i${i}`, titulo: "T".repeat(300), categoria: "Praia" }, valor }));
    const r = montarLancamentos({ ...base, itens });
    expect(r).toHaveLength(1);
    expect(r[0].descricao.length).toBeLessThanOrEqual(120);
  });

  it("confirmar duas vezes gera exatamente os mesmos ids (o servidor trata como a mesma criação)", () => {
    const pedido = { ...base, itens: [{ item: { id: "a", titulo: "Jantar", categoria: "Gastronomia" }, valor: 10 }] };
    expect(montarLancamentos(pedido).map((l) => l.id)).toEqual(montarLancamentos(pedido).map((l) => l.id));
  });

  it("categorias do Roteiro mapeiam para as do app; o resto cai em Passeios & Lazer", () => {
    expect(categoriaFinanceira("Praia")).toBe("Passeios & Lazer");
    expect(categoriaFinanceira("Hospedagem")).toBe("Hospedagem");
    expect(categoriaFinanceira("Outros")).toBe("Passeios & Lazer");
    expect(categoriaFinanceira(null)).toBe("Passeios & Lazer");
  });
});
