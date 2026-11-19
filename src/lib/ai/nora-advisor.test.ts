import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sessao } from "@/lib/auth/sessao";
import { PRAZO_ADVISOR_MS, consultarAdvisor, type DependenciasAdvisor } from "./nora-advisor";
import { DADOS_VAZIOS, type DadosBrutos } from "./nora-contexto";
import { ESTRATEGIA_IDS, type AnaliseNora, type EstrategiaId } from "./nora-strategies";
import { analiseBaseSchema, esquemaDaEstrategia } from "./nora-strategies-servidor";

vi.mock("server-only", () => ({}));

const sessao = { supabase: {}, userId: "u-1", email: null } as unknown as Sessao;
const HOJE = "2026-05-01";

const comViagem: DadosBrutos = {
  ...DADOS_VAZIOS,
  alertas: [{ tipo: "voo", origem: "São Paulo", destino: "Lisboa", ida: "2026-09-10", volta: "2026-09-20", adultos: 2 }],
};

/** Análise que satisfaz as exigências das 9 estratégias de uma vez. */
const analiseCompleta: AnaliseNora = {
  resumo: "Resumo da análise.",
  vereditoBadge: "ESPERE",
  notaCustoBeneficio: 7,
  economiaEstimada: { valorBrl: 900, descricao: "Cortando 20%." },
  opcoes: [
    { titulo: "A", destaque: "Mais barata", detalhe: "Detalhe A", custoEstimadoBrl: 1000 },
    { titulo: "B", destaque: null, detalhe: "Detalhe B", custoEstimadoBrl: 1200 },
    { titulo: "C", destaque: null, detalhe: "Detalhe C", custoEstimadoBrl: null },
  ],
  pontosDeAtencao: [{ gravidade: "atencao", titulo: "Bagagem", detalhe: "Cobrada à parte." }],
  recomendacaoPratica: "Compre com 60 dias de antecedência.",
  acaoSugerida: "criar_alerta_preco",
  precoAlvoSugeridoBrl: 3500,
};

function deps(extra: Partial<DependenciasAdvisor> = {}) {
  const invoke = vi.fn(async () => analiseCompleta as unknown);
  const cota = vi.fn(async () => ({ permitido: true as const, restante: 5 }));
  const base: DependenciasAdvisor = {
    hojeIso: HOJE,
    iaAtiva: () => true,
    cota: cota as never,
    carregar: async () => ({ dados: comViagem, preferencias: ["prefere hotel central"] }),
    modelo: { invoke },
    ...extra,
  };
  return { base, invoke, cota };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("consultarAdvisor", () => {
  it("caminho feliz: chama a IA com o contexto e devolve a análise validada", async () => {
    const { base, invoke, cota } = deps();
    const r = await consultarAdvisor({ estrategia: "veredito_reserva", texto: "voo de R$ 4000" }, sessao, base);
    expect(r.tipo).toBe("analise");
    if (r.tipo !== "analise") return;
    expect(r.origem).toBe("ia");
    expect(r.aviso).toBeNull();
    expect(r.analise.vereditoBadge).toBe("ESPERE");
    expect(r.contexto.destino).toBe("Lisboa");
    expect(cota).toHaveBeenCalledTimes(1);

    const [mensagens, opcoes] = invoke.mock.calls[0] as unknown as [{ content: string }[], { signal: AbortSignal }];
    expect(mensagens).toHaveLength(2);
    expect(mensagens[0].content).toContain("Nora");
    expect(mensagens[1].content).toContain("Destino: Lisboa");
    expect(mensagens[1].content).toContain("prefere hotel central");
    expect(mensagens[1].content).toContain("voo de R$ 4000");
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
    expect(PRAZO_ADVISOR_MS).toBe(12_000);
  });

  it("sem chave de IA: lista local, sem gastar cota nem chamar o modelo", async () => {
    const { base, invoke, cota } = deps({ iaAtiva: () => false });
    const r = await consultarAdvisor({ estrategia: "auditoria_voo", texto: "" }, sessao, base);
    expect(r).toMatchObject({ tipo: "analise", origem: "local" });
    expect(r.tipo === "analise" && r.aviso).toContain("não está ligada");
    expect(cota).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("cota negada: lista local e nenhuma chamada ao modelo", async () => {
    const { base, invoke } = deps({
      cota: async () => ({ permitido: false, motivo: "limite", mensagem: "Limite de uso da IA atingido.", reiniciaEm: null }) as never,
    });
    const r = await consultarAdvisor({ estrategia: "auditoria_voo", texto: "" }, sessao, base);
    expect(r).toMatchObject({ tipo: "analise", origem: "local" });
    expect(r.tipo === "analise" && r.aviso).toContain("Limite de uso da IA atingido.");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("prazo estourado: lista local com aviso de demora", async () => {
    const { base } = deps({
      modelo: {
        invoke: async () => {
          throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
        },
      },
    });
    const r = await consultarAdvisor({ estrategia: "matriz_datas", texto: "" }, sessao, base);
    expect(r).toMatchObject({ tipo: "analise", origem: "local" });
    expect(r.tipo === "analise" && r.aviso).toContain("12 segundos");
  });

  it("erro da IA: lista local, sem derrubar", async () => {
    const { base } = deps({
      modelo: {
        invoke: async () => {
          throw new Error("503");
        },
      },
    });
    const r = await consultarAdvisor({ estrategia: "matriz_datas", texto: "" }, sessao, base);
    expect(r).toMatchObject({ tipo: "analise", origem: "local" });
    expect(r.tipo === "analise" && r.aviso).toContain("indisponível");
  });

  it("resposta fora do formato: lista local", async () => {
    const { base } = deps({ modelo: { invoke: async () => ({ resumo: "só isso" }) } });
    const r = await consultarAdvisor({ estrategia: "matriz_datas", texto: "" }, sessao, base);
    expect(r).toMatchObject({ tipo: "analise", origem: "local" });
    expect(r.tipo === "analise" && r.aviso).toContain("incompleta");
  });

  it("falta de informação: pergunta, sem cota nem IA", async () => {
    const { base, invoke, cota } = deps({ carregar: async () => ({ dados: DADOS_VAZIOS, preferencias: [] }) });
    const r = await consultarAdvisor({ estrategia: "otimizacao_orcamento", texto: "" }, sessao, base);
    expect(r.tipo).toBe("pergunta");
    expect(cota).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sem workspace/dados e sem texto, destino pergunta; com texto, segue", async () => {
    const { base } = deps({ carregar: async () => ({ dados: DADOS_VAZIOS, preferencias: [] }) });
    expect((await consultarAdvisor({ estrategia: "escolha_bairros", texto: "" }, sessao, base)).tipo).toBe("pergunta");
    const r = await consultarAdvisor({ estrategia: "escolha_bairros", texto: "Lisboa" }, sessao, base);
    expect(r).toMatchObject({ tipo: "analise", origem: "ia" });
  });

  it.each(ESTRATEGIA_IDS)("%s: cai no local quando a análise não cumpre a exigência da estratégia", async (id: EstrategiaId) => {
    const vazia: AnaliseNora = {
      ...analiseCompleta,
      vereditoBadge: null,
      notaCustoBeneficio: null,
      economiaEstimada: null,
      opcoes: [],
      pontosDeAtencao: [],
    };
    const { base } = deps({ modelo: { invoke: async () => vazia } });
    const r = await consultarAdvisor({ estrategia: id, texto: "hotel, passeios e voo do casal" }, sessao, base);
    expect(r).toMatchObject({ tipo: "analise", origem: "local" });
  });
});

describe("schemas", () => {
  it("a análise completa passa no schema base e em todas as estratégias", () => {
    expect(analiseBaseSchema.safeParse(analiseCompleta).success).toBe(true);
    for (const id of ESTRATEGIA_IDS) {
      expect(esquemaDaEstrategia(id).safeParse(analiseCompleta).success, id).toBe(true);
    }
  });

  it("rejeita nota fora de 1–10, veredito inválido e valores absurdos", () => {
    expect(analiseBaseSchema.safeParse({ ...analiseCompleta, notaCustoBeneficio: 11 }).success).toBe(false);
    expect(analiseBaseSchema.safeParse({ ...analiseCompleta, notaCustoBeneficio: 0 }).success).toBe(false);
    expect(analiseBaseSchema.safeParse({ ...analiseCompleta, vereditoBadge: "TALVEZ" }).success).toBe(false);
    expect(analiseBaseSchema.safeParse({ ...analiseCompleta, precoAlvoSugeridoBrl: 2_000_000 }).success).toBe(false);
  });

  it("escolha_bairros exige exatamente 3 opções; comparativo exige 2 com custo", () => {
    expect(esquemaDaEstrategia("escolha_bairros").safeParse({ ...analiseCompleta, opcoes: analiseCompleta.opcoes.slice(0, 2) }).success).toBe(false);
    expect(esquemaDaEstrategia("comparativo_hospedagem").safeParse({ ...analiseCompleta, opcoes: [analiseCompleta.opcoes[0], analiseCompleta.opcoes[2]] }).success).toBe(false);
  });

  it("os três vereditos são aceitos", () => {
    for (const v of ["RESERVE_AGORA", "ESPERE", "MUDE_DE_PLANO"] as const) {
      expect(esquemaDaEstrategia("veredito_reserva").safeParse({ ...analiseCompleta, vereditoBadge: v }).success).toBe(true);
    }
  });
});

describe("prazo de 12 s (AbortSignal.timeout)", () => {
  it("a chamada ao modelo recebe AbortSignal.timeout(12000) e, ao abortar, cai na lista local", async () => {
    const controle = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controle.signal);
    const { base } = deps({
      modelo: {
        invoke: (_m, { signal }) =>
          new Promise((_, rejeitar) => signal.addEventListener("abort", () => rejeitar(new DOMException("timeout", "TimeoutError")))),
      },
    });
    const pendente = consultarAdvisor({ estrategia: "veredito_reserva", texto: "" }, sessao, base);
    await vi.waitFor(() => expect(timeout).toHaveBeenCalledWith(12_000));
    controle.abort();
    const r = await pendente;
    expect(r).toMatchObject({ tipo: "analise", origem: "local" });
    expect(r.tipo === "analise" && r.aviso).toContain("12 segundos");
    timeout.mockRestore();
  });
});
