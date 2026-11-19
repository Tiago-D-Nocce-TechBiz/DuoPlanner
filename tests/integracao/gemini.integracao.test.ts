import { afterEach, describe, expect, it, vi } from "vitest";
import type { Sessao } from "@/lib/auth/sessao";
import { consultarAdvisor } from "@/lib/ai/nora-advisor";
import { curarRoteiro, PRAZO_CURADORIA_MS } from "@/lib/ai/roteiro-curadoria";
import type { EntradaCuradoria } from "@/lib/roteiro/tipos";

vi.mock("server-only", () => ({}));

/**
 * Integração com o Gemini real (opt-in): `npm run test:integracao`.
 *
 * Só roda com `GEMINI_API_KEY` definida (ambiente ou `.env.local`); sem ela,
 * tudo é pulado. Valida o que os testes com modelo falso não podem: que a
 * resposta estruturada do modelo de verdade passa nos schemas, que as
 * sugestões ficam restritas aos destinos da planilha, sem links, e que o
 * prazo de 12 s é pedido ao `AbortSignal.timeout` e de fato interrompe a
 * chamada. A cota e a sessão são falsas: nada é gravado em banco.
 */
const TEM_CHAVE = Boolean(process.env.GEMINI_API_KEY);
const sessao = { supabase: {}, userId: "u-integracao", email: null } as unknown as Sessao;
const cotaLiberada = async () => ({ permitido: true as const, restante: 99 });
const SEM_LINK = /https?:\/\/|www\.|\.com\b|\.pt\b/i;

const PLANILHA: EntradaCuradoria = {
  incluirSugestoes: true,
  dias: [
    { numero: 1, data: "2026-09-10", destino: "Lisboa" },
    { numero: 2, data: "2026-09-11", destino: "Cascais" },
  ],
  linhas: [
    { linha: 2, dia: 1, destino: "Lisboa", data: "2026-09-10", atividade: "Bondinho 28", categoria: "Passeio", classificar: false },
    { linha: 3, dia: 1, destino: "Lisboa", data: "2026-09-10", atividade: "Parada na Pastelaria Manteigaria", categoria: "Outros", classificar: true },
    { linha: 4, dia: 2, destino: "Cascais", data: "2026-09-11", atividade: "Praia de Carcavelos", categoria: "Praia", classificar: false },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe.skipIf(!TEM_CHAVE)("Gemini real", () => {
  it("curarRoteiroImportado: saída estruturada, só destinos da planilha e sem links", async () => {
    const inicio = Date.now();
    const r = await curarRoteiro(PLANILHA, sessao, { cota: cotaLiberada });
    const ms = Date.now() - inicio;
    console.info(`[integracao] curadoria: origem=${r.origem} em ${ms} ms, ${r.sugestoes.length} sugestões`);

    // O prazo vale: nunca passa muito de 12 s, com IA ou com o aviso de demora.
    expect(ms).toBeLessThan(PRAZO_CURADORIA_MS + 3_000);
    if (r.origem === "local") {
      expect(r.aviso).toMatch(/segundos|indisponível|incompleta/);
      return;
    }
    expect(r.sugestoes.length).toBeGreaterThan(0);
    const destinos = new Set(PLANILHA.dias.map((d) => d.destino));
    const naPlanilha = new Set(PLANILHA.linhas.map((l) => l.atividade.toLowerCase()));
    for (const s of r.sugestoes) {
      expect(destinos.has(s.destino), `destino fora da planilha: ${s.destino}`).toBe(true);
      expect(["Praia", "Passeio", "Gastronomia"]).toContain(s.categoria);
      expect(`${s.titulo} ${s.porque}`).not.toMatch(SEM_LINK);
      expect(naPlanilha.has(s.titulo.toLowerCase())).toBe(false);
      expect(s.porque.length).toBeGreaterThan(10);
      if (s.diaNumero !== null) expect(PLANILHA.dias.some((d) => d.numero === s.diaNumero)).toBe(true);
    }
    // Só se classifica o que foi pedido (linha 3).
    for (const c of r.classificacoes) expect(c.linha).toBe(3);
  });

  it("consultarNora: escolha_bairros devolve 3 opções do contexto, sem links", async () => {
    const r = await consultarAdvisor({ estrategia: "escolha_bairros", texto: "" }, sessao, {
      hojeIso: "2026-05-01",
      cota: cotaLiberada,
      carregar: async () => ({
        dados: {
          buscas: [],
          dias: [],
          itens: [],
          despesas: [],
          alertas: [{ tipo: "voo", origem: "São Paulo", destino: "Lisboa", ida: "2026-09-10", volta: "2026-09-20", adultos: 2 }],
        },
        preferencias: ["prefere andar a pé"],
      }),
    });
    if (r.tipo !== "analise") throw new Error(`esperava análise, veio ${r.tipo}`);
    console.info(`[integracao] nora: origem=${r.origem}`);
    expect(r.contexto.destino).toBe("Lisboa");
    if (r.origem === "local") {
      expect(r.aviso).toMatch(/segundos|indisponível|incompleta/);
      return;
    }
    expect(r.analise.opcoes).toHaveLength(3);
    expect(JSON.stringify(r.analise)).not.toMatch(SEM_LINK);
  });

  it("o prazo é pedido ao AbortSignal.timeout e interrompe a chamada real", async () => {
    const real = AbortSignal.timeout.bind(AbortSignal);
    // O mesmo caminho do app, com o prazo encurtado para o teste não esperar 12 s.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => real(ms === PRAZO_CURADORIA_MS ? 50 : ms));
    const inicio = Date.now();
    const r = await curarRoteiro(PLANILHA, sessao, { cota: cotaLiberada });
    expect(timeout).toHaveBeenCalledWith(PRAZO_CURADORIA_MS);
    expect(Date.now() - inicio).toBeLessThan(10_000);
    expect(r.origem).toBe("local");
    expect(r.aviso).toContain("12 segundos");
  });
});

describe.skipIf(TEM_CHAVE)("Gemini real (sem GEMINI_API_KEY)", () => {
  it("pulado: defina GEMINI_API_KEY para rodar a integração", () => {
    expect(TEM_CHAVE).toBe(false);
  });
});
