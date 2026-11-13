import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchComPrazo, fetchWithTimeout, LIMITE_EXTERNO_MS, tempoEsgotado } from "./fetch-com-limite";

/** fetch falso que só responde quando mandam (ou rejeita com o motivo do signal). */
function fetchPendurado() {
  const chamadas: RequestInit[] = [];
  const fazer = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push(init ?? {});
    return new Promise<Response>((_resolve, rejeitar) => {
      init?.signal?.addEventListener("abort", () => rejeitar(init.signal!.reason), { once: true });
    });
  });
  return { fazer: fazer as unknown as typeof fetch, chamadas };
}

afterEach(() => vi.useRealTimers());

describe("fetchWithTimeout", () => {
  it("padrão de 8 s para serviços externos", () => {
    expect(LIMITE_EXTERNO_MS).toBe(8000);
  });

  it("interrompe no prazo com TimeoutError, sem pendurar a requisição", async () => {
    vi.useFakeTimers();
    const { fazer } = fetchPendurado();
    const pedido = fetchWithTimeout("https://api.exemplo.dev", { timeoutMs: 50 }, fazer);
    const resultado = pedido.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60);
    const erro = await resultado;
    expect(tempoEsgotado(erro)).toBe(true);
  });

  it("o cancelamento do chamador continua valendo junto com o prazo", async () => {
    const { fazer } = fetchPendurado();
    const controle = new AbortController();
    const pedido = fetchWithTimeout("https://api.exemplo.dev", { signal: controle.signal, timeoutMs: 10_000 }, fazer);
    controle.abort(new DOMException("saiu da tela", "AbortError"));
    const erro = await pedido.catch((e: unknown) => e);
    expect((erro as Error).name).toBe("AbortError");
    expect(tempoEsgotado(erro)).toBe(false);
  });

  it("repassa método, cabeçalhos e corpo", async () => {
    const fazer = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    await fetchWithTimeout("https://api.exemplo.dev", { method: "POST", headers: { a: "1" }, body: "x" }, fazer);
    const init = (fazer as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ a: "1" });
    expect(init.body).toBe("x");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("prazo inválido é erro de programação", () => {
    expect(() => fetchWithTimeout("https://x.dev", { timeoutMs: 0 })).toThrow(RangeError);
  });

  it("fetchComPrazo injeta o mesmo prazo em toda chamada (ex.: supabase-js)", async () => {
    vi.useFakeTimers();
    const { fazer } = fetchPendurado();
    const comPrazo = fetchComPrazo(30, fazer);
    const erro = comPrazo("https://projeto.supabase.co/rest/v1/x").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(40);
    expect(tempoEsgotado(await erro)).toBe(true);
  });

  it("tempoEsgotado só reconhece o prazo, não rede caída", () => {
    expect(tempoEsgotado(new DOMException("x", "TimeoutError"))).toBe(true);
    expect(tempoEsgotado(new TypeError("fetch failed"))).toBe(false);
    expect(tempoEsgotado(null)).toBe(false);
  });
});
