import { describe, expect, it } from "vitest";
import { CONTEXTO_VAZIO, estrategiaPorId, type AnaliseNora, type ContextoUsado } from "@/lib/ai/nora-strategies";
import { alertaDaAnalise, dicaParaRoteiro } from "./nora-acoes-analise";

const analise: AnaliseNora = {
  resumo: "r",
  vereditoBadge: null,
  notaCustoBeneficio: null,
  economiaEstimada: null,
  opcoes: [],
  pontosDeAtencao: [
    { gravidade: "info", titulo: "Só info", detalhe: "x" },
    { gravidade: "critico", titulo: "Taxa de resort", detalhe: "x" },
    { gravidade: "atencao", titulo: "Bagagem", detalhe: "x" },
    { gravidade: "atencao", titulo: "Terceira", detalhe: "x" },
  ],
  recomendacaoPratica: "Confira a taxa antes de pagar.",
  acaoSugerida: "salvar_dica_roteiro",
  precoAlvoSugeridoBrl: 3500,
};

const ctx: ContextoUsado = { ...CONTEXTO_VAZIO, destino: "Lisboa", origem: "São Paulo", ida: "2026-09-10", volta: "2026-09-20", adultos: 2 };
const base = { analise, userId: "u1", workspaceId: "w1", hojeIso: "2026-05-01", agoraIso: "2026-05-01T10:00:00Z", id: "a1" };

describe("dicaParaRoteiro", () => {
  it("monta título com o destino e nota com a recomendação e os 2 alertas mais graves (sem info)", () => {
    const d = dicaParaRoteiro(estrategiaPorId("verificacao_taxas"), analise, "Lisboa");
    expect(d.titulo).toBe("Dica da Nora: Taxas Ocultas (Lisboa)");
    expect(d.nota).toBe("Confira a taxa antes de pagar. Atenção: Taxa de resort; Bagagem.");
  });

  it("respeita os tetos de 120 e 500 caracteres", () => {
    const d = dicaParaRoteiro(estrategiaPorId("verificacao_taxas"), { ...analise, recomendacaoPratica: "x".repeat(900) }, "L".repeat(300));
    expect(d.titulo.length).toBeLessThanOrEqual(120);
    expect(d.nota.length).toBeLessThanOrEqual(500);
  });
});

describe("alertaDaAnalise", () => {
  it("cria alerta de voo com destino, datas e preço-alvo da análise", () => {
    const r = alertaDaAnalise({ ...base, contexto: ctx });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.alerta).toMatchObject({ tipo: "voo", destino: "Lisboa", ida: "2026-09-10", volta: "2026-09-20", adultos: 2, precoAlvo: 3500, ativo: true, userId: "u1", workspaceId: "w1" });
  });

  it("sem destino, explica o que falta", () => {
    const r = alertaDaAnalise({ ...base, contexto: { ...ctx, destino: null } });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.motivo).toContain("destino");
  });

  it("ida no passado ou ausente não cria alerta", () => {
    expect(alertaDaAnalise({ ...base, contexto: { ...ctx, ida: "2026-04-30" } }).ok).toBe(false);
    expect(alertaDaAnalise({ ...base, contexto: { ...ctx, ida: null } }).ok).toBe(false);
  });

  it("limita viajantes, descarta volta anterior à ida e preço-alvo inválido", () => {
    const r = alertaDaAnalise({ ...base, contexto: { ...ctx, adultos: 40, volta: "2026-09-01" }, analise: { ...analise, precoAlvoSugeridoBrl: null } });
    expect(r.ok && r.alerta.adultos).toBe(9);
    expect(r.ok && r.alerta.volta).toBeNull();
    expect(r.ok && r.alerta.precoAlvo).toBeNull();
  });
});
