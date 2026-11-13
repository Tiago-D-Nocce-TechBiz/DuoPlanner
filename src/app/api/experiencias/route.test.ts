import { AIMessageChunk } from "@langchain/core/messages";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarLeitorDeLinhas, type EventoExperiencias, type LocalGem } from "@/lib/ai/experiencias-protocolo";

/**
 * A rota inteira com as fronteiras trocadas: sessão, cota, memória, ambiente
 * e o Gemini (um modelo falso com o mesmo contrato de `stream`). O que é da
 * rota de verdade: ordem das verificações, códigos HTTP, NDJSON em fluxo,
 * cache sem cota e cancelamento.
 */

const h = vi.hoisted(() => ({
  sessao: { ok: true as boolean },
  cota: { permitido: true as boolean },
  iaAtiva: true,
  trechos: [] as string[],
  sinalDoModelo: undefined as AbortSignal | undefined,
  chamadasAoModelo: 0,
  travar: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({
  exigirSessaoApi: vi.fn(async () =>
    h.sessao.ok
      ? { ok: true, sessao: { supabase: {}, userId: "u-1", email: null } }
      : { ok: false, resposta: Response.json({ error: "Sua sessão expirou.", code: "NAO_AUTENTICADO" }, { status: 401 }) }
  ),
}));
vi.mock("@/lib/seguranca/cotas", () => ({
  consumirCota: vi.fn(async () =>
    h.cota.permitido
      ? { permitido: true, restante: 9 }
      : { permitido: false, motivo: "limite", mensagem: "Limite de uso da IA atingido.", reiniciaEm: null }
  ),
  respostaCotaNegada: vi.fn((c: { mensagem: string }) => Response.json({ error: c.mensagem, code: "COTA_EXCEDIDA" }, { status: 429 })),
}));
vi.mock("@/lib/memory/store", () => ({ loadPreferencesSafe: vi.fn(async () => ({ interesses: ["museus"] })) }));
vi.mock("@/lib/env", () => ({ integracaoAtiva: vi.fn(() => h.iaAtiva) }));
vi.mock("@/lib/ai/model", () => ({
  AI_TIMEOUT_MS: 8000,
  AiNotConfiguredError: class extends Error {
    constructor() {
      super("IA indisponível: defina GEMINI_API_KEY (Google AI Studio).");
    }
  },
  createGeminiModel: () => ({
    withConfig: () => ({
      async stream(_m: unknown, config?: { signal?: AbortSignal }) {
        h.chamadasAoModelo++;
        h.sinalDoModelo = config?.signal;
        async function* gerar() {
          for (const t of h.trechos) {
            await new Promise((r) => setTimeout(r, 2));
            yield new AIMessageChunk({ content: t });
          }
          if (h.travar) {
            await new Promise((_, rejeitar) => config?.signal?.addEventListener("abort", () => rejeitar(config.signal?.reason)));
          }
        }
        return IterableReadableStream.fromAsyncGenerator(gerar());
      },
    }),
  }),
}));

const { POST } = await import("./route");
const { limparCacheDeExperiencias } = await import("@/lib/ai/local-gems-agent");
const { consumirCota } = await import("@/lib/seguranca/cotas");

const HOST = "duo.example.com";
const gem = (n: number): LocalGem => ({
  nome: `Lugar ${n}`,
  descricao: `O que fazer no lugar ${n}.`,
  custo: "baixo custo",
  custo_estimado: "R$ 20 por pessoa",
  melhor_momento: "Manhã",
  dica_local: "Vá de metrô.",
});
const RESPOSTA = JSON.stringify({ experiencias: [gem(1), gem(2), gem(3)] });

function pedido(corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return new NextRequest(`https://${HOST}/api/experiencias`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: `https://${HOST}`, host: HOST, "sec-fetch-site": "same-origin", ...cabecalhos },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

async function eventos(resposta: Response): Promise<EventoExperiencias[]> {
  const texto = await resposta.text();
  return criarLeitorDeLinhas()(texto, true);
}

beforeEach(() => {
  limparCacheDeExperiencias();
  h.sessao.ok = true;
  h.cota.permitido = true;
  h.iaAtiva = true;
  h.trechos = Array.from({ length: Math.ceil(RESPOSTA.length / 40) }, (_, i) => RESPOSTA.slice(i * 40, (i + 1) * 40));
  h.chamadasAoModelo = 0;
  h.sinalDoModelo = undefined;
  h.travar = false;
  vi.mocked(consumirCota).mockClear();
});

describe("POST /api/experiencias", () => {
  it("responde NDJSON em fluxo: inicio, rascunhos, as 3 sugestões e fim", async () => {
    const r = await POST(pedido({ destino: "Lisboa", dataViagem: "2026-12-05" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const lista = await eventos(r);
    expect(lista[0]).toEqual({ tipo: "inicio", destino: "Lisboa", contexto: ["Interesses: museus"] });
    expect(lista.filter((e) => e.tipo === "experiencia").map((e) => e.experiencia.nome)).toEqual(["Lugar 1", "Lugar 2", "Lugar 3"]);
    expect(lista.some((e) => e.tipo === "rascunho")).toBe(true);
    expect(lista.at(-1)).toEqual({ tipo: "fim" });
    expect(consumirCota).toHaveBeenCalledTimes(1);
  });

  it("o primeiro card chega antes de a resposta terminar (o corpo é um fluxo de verdade)", async () => {
    const r = await POST(pedido({ destino: "Lisboa" }));
    const leitor = r.body!.getReader();
    const decodificador = new TextDecoder();
    const linhas = criarLeitorDeLinhas();
    let primeiraPronta = -1;
    let leituras = 0;
    while (true) {
      const { value, done } = await leitor.read();
      if (done) break;
      leituras++;
      if (primeiraPronta < 0 && linhas(decodificador.decode(value, { stream: true })).some((e) => e.tipo === "experiencia")) {
        primeiraPronta = leituras;
      }
    }
    expect(primeiraPronta).toBeGreaterThan(0);
    expect(primeiraPronta).toBeLessThan(leituras);
  });

  it("a mesma busca de novo sai do cache: não chama a IA nem gasta a cota", async () => {
    await eventos(await POST(pedido({ destino: "Lisboa", dataViagem: "2026-12-05" })));
    vi.mocked(consumirCota).mockClear();
    const lista = await eventos(await POST(pedido({ destino: "LISBOA", dataViagem: "2026-12-20" })));
    expect(lista.map((e) => e.tipo)).toEqual(["inicio", "experiencia", "experiencia", "experiencia", "fim"]);
    expect(h.chamadasAoModelo).toBe(1);
    expect(consumirCota).not.toHaveBeenCalled();
  });

  it("recusa outra origem (403) antes de olhar a sessão", async () => {
    h.sessao.ok = false;
    const r = await POST(pedido({ destino: "Lisboa" }, { origin: "https://outro.site", "sec-fetch-site": "cross-site" }));
    expect(r.status).toBe(403);
  });

  it("sem sessão: 401 em JSON", async () => {
    h.sessao.ok = false;
    const r = await POST(pedido({ destino: "Lisboa" }));
    expect(r.status).toBe(401);
  });

  it("corpo: 415 sem JSON, 413 grande demais, 400 destino inválido", async () => {
    expect((await POST(pedido({ destino: "Lisboa" }, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(pedido({ destino: "Lisboa", lixo: "x".repeat(5000) }))).status).toBe(413);
    const invalido = await POST(pedido({ destino: "<script>" }));
    expect(invalido.status).toBe(400);
    expect(await invalido.json()).toMatchObject({ error: "Destino inválido para sugestões.", code: "ENTRADA_INVALIDA" });
    expect((await POST(pedido("{quebrado"))).status).toBe(400);
    expect(consumirCota).not.toHaveBeenCalled();
  });

  it("IA desligada: 503 com a mensagem de configuração", async () => {
    h.iaAtiva = false;
    const r = await POST(pedido({ destino: "Lisboa" }));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("GEMINI_API_KEY");
  });

  it("cota esgotada: 429 e nenhuma chamada à IA", async () => {
    h.cota.permitido = false;
    const r = await POST(pedido({ destino: "Lisboa" }));
    expect(r.status).toBe(429);
    expect(h.chamadasAoModelo).toBe(0);
  });

  it("a tela fechou a conexão no meio: a chamada ao Gemini é abortada", async () => {
    h.travar = true;
    h.trechos = h.trechos.slice(0, 3);
    const r = await POST(pedido({ destino: "Lisboa" }));
    const leitor = r.body!.getReader();
    const decodificador = new TextDecoder();
    // Lê até a IA começar a escrever (o primeiro rascunho) e então desiste.
    while (!decodificador.decode((await leitor.read()).value).includes('"rascunho"'));
    expect(h.sinalDoModelo?.aborted).toBe(false);
    await leitor.cancel();
    await vi.waitFor(() => expect(h.sinalDoModelo?.aborted).toBe(true));
  });
});
