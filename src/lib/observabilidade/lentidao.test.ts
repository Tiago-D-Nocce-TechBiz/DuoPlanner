import type { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { describe, expect, it } from "vitest";
import { ATRIBUTO_ACAO, LIMITE_LENTO_MS, ProcessadorDeLentidao, type AvisoLentidao } from "./lentidao";

/** Span terminado, só com o que o processador lê. */
function span(nome: string, duracaoMs: number, atributos: Record<string, unknown>, traceId = "t1"): ReadableSpan {
  return {
    name: nome,
    duration: [Math.floor(duracaoMs / 1000), (duracaoMs % 1000) * 1e6],
    attributes: atributos,
    spanContext: () => ({ traceId, spanId: "s", traceFlags: 1 }),
  } as unknown as ReadableSpan;
}

function processador() {
  const avisos: AvisoLentidao[] = [];
  return { p: new ProcessadorDeLentidao(LIMITE_LENTO_MS, (a) => avisos.push(a)), avisos };
}

describe("ProcessadorDeLentidao", () => {
  it("limite de 1500 ms", () => {
    expect(LIMITE_LENTO_MS).toBe(1500);
  });

  it("Server Action acima do limite: um aviso estruturado com o nome da action", () => {
    const { p, avisos } = processador();
    p.onEnd(span("acao sincronizarOperacoes", 2300, { [ATRIBUTO_ACAO]: "sincronizarOperacoes" }));
    expect(avisos).toEqual([
      expect.objectContaining({ nivel: "warn", evento: "chamada_lenta", tipo: "acao", acao: "sincronizarOperacoes", duracaoMs: 2300, limiteMs: 1500 }),
    ]);
  });

  it("rota de API lenta: método, rota e status no aviso", () => {
    const { p, avisos } = processador();
    p.onEnd(
      span("executing api route (app) /api/hotels", 4100, {
        "next.span_type": "AppRouteRouteHandlers.runHandler",
        "next.route": "/api/hotels",
        "http.method": "GET",
        "http.status_code": 200,
      })
    );
    expect(avisos[0]).toMatchObject({ tipo: "rota_api", rota: "/api/hotels", metodo: "GET", status: 200 });
  });

  it("abaixo do limite: silêncio", () => {
    const { p, avisos } = processador();
    p.onEnd(span("acao x", 1499, { [ATRIBUTO_ACAO]: "x" }));
    expect(avisos).toHaveLength(0);
  });

  it("spans internos do Next (render, fetch, módulos) não poluem o log", () => {
    const { p, avisos } = processador();
    p.onEnd(span("render route (app) /dashboard", 9000, { "next.span_type": "AppRender.getBodyResult" }));
    p.onEnd(span("fetch GET https://api", 9000, { "next.span_type": "AppRender.fetch" }));
    expect(avisos).toHaveLength(0);
  });

  it("a requisição que carregou uma action ou rota lenta não é relatada de novo (mesmo traceId)", () => {
    const { p, avisos } = processador();
    p.onEnd(span("acao gerarConvite", 1800, { [ATRIBUTO_ACAO]: "gerarConvite" }, "trace-A"));
    p.onEnd(span("POST /dashboard", 1900, { "next.span_type": "BaseServer.handleRequest" }, "trace-A"));
    p.onEnd(span("executing api route (app) /api/hotels", 3000, { "next.span_type": "AppRouteRouteHandlers.runHandler" }, "trace-C"));
    p.onEnd(span("GET /api/hotels", 3100, { "next.span_type": "BaseServer.handleRequest" }, "trace-C"));
    p.onEnd(span("GET /dashboard/financas", 2500, { "next.span_type": "BaseServer.handleRequest", "next.route": "/dashboard/financas" }, "trace-B"));
    expect(avisos.map((a) => [a.tipo, a.traceId])).toEqual([
      ["acao", "trace-A"],
      ["rota_api", "trace-C"],
      ["requisicao", "trace-B"],
    ]);
  });
});
