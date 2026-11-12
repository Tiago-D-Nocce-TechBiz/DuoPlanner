import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ambiente, integracaoAtiva, integracoes } = await import("./index");
const { ErroDeAmbiente } = await import("./esquema");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("@/lib/env (leitura do process.env)", () => {
  it("reflete a mudança das variáveis (o cache é pela combinação de valores)", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    expect(integracaoAtiva("ia")).toBe(false);
    vi.stubEnv("GEMINI_API_KEY", "AIza-teste");
    expect(integracaoAtiva("ia")).toBe(true);
    expect(ambiente().ia?.apiKey).toBe("AIza-teste");
  });

  it("configuração malformada lança ErroDeAmbiente (nunca degrada em silêncio)", () => {
    vi.stubEnv("CRON_SECRET", "curto");
    expect(() => ambiente()).toThrow(ErroDeAmbiente);
    expect(() => integracoes()).toThrow(/CRON_SECRET/);
  });

  it("chave secreta numa NEXT_PUBLIC_ desconhecida também barra", () => {
    vi.stubEnv("NEXT_PUBLIC_DEBUG_TOKEN", "sb_secret_vazada");
    expect(() => ambiente()).toThrow(/NEXT_PUBLIC_DEBUG_TOKEN/);
  });
});
