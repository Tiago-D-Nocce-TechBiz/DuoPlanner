import { describe, expect, it, vi } from "vitest";
import { lerRelatorio, registrarRelatorio, TAMANHO_MAXIMO_RELATORIO } from "./web-vitals";

const HOST = "duo.example.com";
const mesmaOrigem = new Headers({ "sec-fetch-site": "same-origin", origin: `https://${HOST}`, host: HOST });
const corpo = (metricas: unknown[]) => JSON.stringify({ metricas });
const LCP = { nome: "LCP", valor: 2380.4, nota: "good", id: "v5-1", navegacao: "navigate", pagina: "/dashboard/financas" };

describe("relatório de Web Vitals (/api/vitals)", () => {
  it("aceita o envio do próprio app", () => {
    const r = lerRelatorio(corpo([LCP, { ...LCP, nome: "CLS", valor: 0.31, nota: "poor" }]), mesmaOrigem);
    expect(r.ok).toBe(true);
  });

  it("recusa outra origem (403)", () => {
    expect(lerRelatorio(corpo([LCP]), new Headers({ "sec-fetch-site": "cross-site" }))).toEqual({ ok: false, status: 403 });
    expect(lerRelatorio(corpo([LCP]), new Headers({ origin: "https://outro.site", host: HOST }))).toEqual({ ok: false, status: 403 });
    expect(lerRelatorio(corpo([LCP]), new Headers({ host: HOST }))).toEqual({ ok: false, status: 403 });
  });

  it("recusa corpo grande (413), JSON quebrado e campos fora do formato (400)", () => {
    expect(lerRelatorio("x".repeat(TAMANHO_MAXIMO_RELATORIO + 1), mesmaOrigem)).toEqual({ ok: false, status: 413 });
    expect(lerRelatorio("{", mesmaOrigem)).toEqual({ ok: false, status: 400 });
    expect(lerRelatorio(corpo([{ ...LCP, nome: "FID" }]), mesmaOrigem)).toEqual({ ok: false, status: 400 });
    expect(lerRelatorio(corpo([{ ...LCP, valor: -1 }]), mesmaOrigem)).toEqual({ ok: false, status: 400 });
  });

  it("caminho sem query nem fragmento: código de convite e e-mail não entram no log", () => {
    expect(lerRelatorio(corpo([{ ...LCP, pagina: "/convite?code=ABC123" }]), mesmaOrigem).ok).toBe(false);
    expect(lerRelatorio(corpo([{ ...LCP, pagina: "/login#ana@x.com" }]), mesmaOrigem).ok).toBe(false);
  });

  it("uma linha JSON por métrica; nota ruim vira aviso", () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const r = lerRelatorio(corpo([LCP, { ...LCP, nome: "CLS", valor: 0.31234, nota: "poor" }]), mesmaOrigem);
    if (!r.ok) throw new Error("devia aceitar");
    registrarRelatorio(r.relatorio, log);
    expect(JSON.parse(log.info.mock.calls[0][0])).toMatchObject({ evento: "web_vital", metrica: "LCP", valor: 2380, nota: "good" });
    expect(JSON.parse(log.warn.mock.calls[0][0])).toMatchObject({ metrica: "CLS", valor: 0.312, nota: "poor" });
  });
});
