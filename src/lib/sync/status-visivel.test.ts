import { describe, expect, it } from "vitest";
import { detalheDoEstado, estadoVisivel, ROTULO_ESTADO } from "./status-visivel";

const base = { modo: "nuvem" as const, pendentes: 0, semServidor: false };

describe("selo de sincronização", () => {
  it("os três estados pedidos, com os textos exatos", () => {
    expect(ROTULO_ESTADO[estadoVisivel(base, true, false)!]).toBe("Sincronizado na nuvem");
    expect(ROTULO_ESTADO[estadoVisivel({ ...base, pendentes: 2 }, true, true)!]).toBe("Salvando alterações…");
    expect(ROTULO_ESTADO[estadoVisivel(base, false, false)!]).toBe("Offline (Salvo neste aparelho)");
  });

  it("some sem sessão sincronizando", () => {
    expect(estadoVisivel({ ...base, modo: "inativo" }, true, false)).toBeNull();
    expect(estadoVisivel({ ...base, modo: "inativo" }, false, false)).toBeNull();
  });

  it("“Salvando…” só depois da espera: um toque rápido não pisca o selo", () => {
    expect(estadoVisivel({ ...base, pendentes: 1 }, true, false)).toBe("nuvem");
    expect(estadoVisivel({ ...base, pendentes: 1 }, true, true)).toBe("salvando");
  });

  it("prioridade: sem internet > carregando > modo local > servidor fora > salvando", () => {
    expect(estadoVisivel({ modo: "carregando", pendentes: 3, semServidor: true }, false, true)).toBe("offline");
    expect(estadoVisivel({ modo: "carregando", pendentes: 3, semServidor: true }, true, true)).toBe("conectando");
    expect(estadoVisivel({ modo: "local", pendentes: 3, semServidor: true }, true, true)).toBe("local");
    expect(estadoVisivel({ modo: "nuvem", pendentes: 3, semServidor: true }, true, true)).toBe("offline");
  });

  it("a dica diferencia internet ausente de servidor que não responde e conta o que ficou guardado", () => {
    expect(detalheDoEstado("offline", { pendentes: 2, semServidor: false }, false)).toMatch(/^Sem internet.*2 alterações guardada/);
    expect(detalheDoEstado("offline", { pendentes: 1, semServidor: true }, true)).toMatch(/servidor não respondeu.*1 alteração.*Toque/);
    expect(detalheDoEstado("nuvem", { pendentes: 0, semServidor: false }, true)).toMatch(/vocês dois/);
  });
});
