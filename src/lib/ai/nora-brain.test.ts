import { describe, expect, it } from "vitest";
import { extrairValor, responderNora, type NoraAcao } from "./nora-brain";

const CTX = { hojeIso: "2026-11-01" };

function proposta(frase: string) {
  return responderNora(frase, CTX).acoes.find(
    (a): a is Extract<NoraAcao, { tipo: "proposta_despesa" }> => a.tipo === "proposta_despesa"
  );
}

describe("extrairValor (T1: número só é dinheiro com padrão monetário)", () => {
  it.each([
    ["Lance R$ 150 de almoço", 150],
    ["lance R$1.234,56 de hotel", 1234.56],
    ["gastei 89,90 no bar", 89.9],
    ["o hotel custou 300 reais", 300],
    ["gastei 150 no almoço", 150],
    ["paguei uns 80 no táxi", 80],
    ["sorvete 12.50", 12.5],
  ])("%s → %d", (frase, valor) => {
    expect(extrairValor(frase)).toBe(valor);
  });

  it.each([
    "Anote o roteiro do dia 12",
    "quero passagens para 2 pessoas",
    "hotel para 3 noites em 10/07",
    "paguei 2 diárias",
    "anote 12 de agosto",
    "voo às 10:30",
  ])("%s → sem valor", (frase) => {
    expect(extrairValor(frase)).toBeNull();
  });
});

describe("responderNora — lançamento vira proposta (nunca grava sozinha)", () => {
  it("propõe o gasto compartilhado com Confirmar pendente", () => {
    const p = proposta("Lance R$ 150 de almoço como gasto compartilhado");
    expect(p).toBeDefined();
    expect(p?.status).toBe("pendente");
    expect(p?.item).toMatchObject({
      estabelecimento: "Almoço",
      valor: 150,
      escopo: "viagem_compartilhado",
      data: "01/11/2026",
      origem: "Nora",
    });
  });

  it("entende verbos de gasto sem 'lance'", () => {
    expect(proposta("gastei 89,90 no bar")?.item).toMatchObject({ estabelecimento: "Bar", valor: 89.9 });
    expect(proposta("o hotel custou 300 reais")?.item).toMatchObject({
      estabelecimento: "Hotel",
      valor: 300,
      categoriaDestino: "Hospedagem",
    });
  });

  it("respeita o escopo pessoal pedido na frase", () => {
    expect(proposta("paguei R$ 45,50 de farmácia, é pessoal")?.item.escopo).toBe("pessoal_privado");
  });

  it.each([
    "Anote o roteiro do dia 12",
    "quero passagens de BH para Salvador para 2 pessoas",
    "quanto já gastei na viagem?",
  ])("%s não gera proposta de gasto", (frase) => {
    expect(proposta(frase)).toBeUndefined();
  });

  it("rota de viagem continua gerando links (regressão de a3787cc)", () => {
    const r = responderNora("belo horizonte para cabo frio dia 12/08, 2 pessoas", CTX);
    const links = r.acoes.find((a) => a.tipo === "links");
    expect(links).toMatchObject({
      tipo: "links",
      dados: { originIata: "CNF", destinationIata: "CFB", departDate: "2027-08-12", passengers: 2 },
    });
  });

  it.each([
    ["obrigado", "links"],
    ["oi", "links"],
  ])("'%s' não vira busca (%s)", (frase, tipo) => {
    expect(responderNora(frase, CTX).acoes.some((a) => a.tipo === tipo)).toBe(false);
  });

  it("pergunta de convite leva ao atalho de convite", () => {
    const r = responderNora("como convido minha dupla?", CTX);
    expect(r.acoes).toContainEqual({ tipo: "atalho", rotulo: "Abrir Modal de Convite", acaoId: "convite" });
  });

  it("'quanto já gastei?' vira resumo financeiro", () => {
    const r = responderNora("quanto já gastei?", CTX);
    expect(r.acoes.some((a) => a.tipo === "atalho" && a.href === "/dashboard/financas")).toBe(true);
  });
});
