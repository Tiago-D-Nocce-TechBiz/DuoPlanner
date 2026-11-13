import { describe, expect, it } from "vitest";
import { lerCorpoLimitado } from "./corpo-limitado";

/** Corpo em fluxo, sem Content-Length (como um envio `chunked`). */
function emPedacos(...pedacos: string[]): Request {
  const codificador = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    start(controle) {
      for (const p of pedacos) controle.enqueue(codificador.encode(p));
      controle.close();
    },
  });
  return new Request("https://duo.example.com/api/x", { method: "POST", body: corpo, duplex: "half" } as RequestInit);
}

describe("lerCorpoLimitado", () => {
  it("devolve o texto dentro do teto, inclusive acentos partidos entre pedaços", async () => {
    const r = new Request("https://duo.example.com/api/x", { method: "POST", body: '{"destino":"São Paulo"}' });
    expect(await lerCorpoLimitado(r, 1024)).toBe('{"destino":"São Paulo"}');
    const bytes = new TextEncoder().encode("ã");
    const partido = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 1));
        c.enqueue(bytes.slice(1));
        c.close();
      },
    });
    const r2 = new Request("https://duo.example.com/api/x", { method: "POST", body: partido, duplex: "half" } as RequestInit);
    expect(await lerCorpoLimitado(r2, 1024)).toBe("ã");
  });

  it("recusa pelo Content-Length declarado, sem ler", async () => {
    const r = new Request("https://duo.example.com/api/x", {
      method: "POST",
      body: "x".repeat(10),
      headers: { "content-length": "999999" },
    });
    expect(await lerCorpoLimitado(r, 1024)).toBeNull();
  });

  it("sem Content-Length, para de ler quando passa do teto", async () => {
    expect(await lerCorpoLimitado(emPedacos("x".repeat(600), "y".repeat(600)), 1024)).toBeNull();
    expect(await lerCorpoLimitado(emPedacos("x".repeat(600), "y".repeat(400)), 1024)).toHaveLength(1000);
  });

  it("sem corpo, texto vazio", async () => {
    expect(await lerCorpoLimitado(new Request("https://duo.example.com/api/x", { method: "POST" }), 10)).toBe("");
  });
});
