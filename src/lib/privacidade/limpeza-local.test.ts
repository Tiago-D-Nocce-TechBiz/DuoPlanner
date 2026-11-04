import { describe, expect, it } from "vitest";
import { cacheDoUsuario, limparChavesDoStorage } from "./limpeza-local";

/** Storage em memória com a mesma interface do navegador. */
function storageFalso(inicial: Record<string, string>) {
  const dados = new Map(Object.entries(inicial));
  return {
    get length() {
      return dados.size;
    },
    key: (i: number) => [...dados.keys()][i] ?? null,
    removeItem: (k: string) => void dados.delete(k),
    chaves: () => [...dados.keys()].sort(),
  };
}

describe("limparChavesDoStorage (logout)", () => {
  it("remove todas as chaves pd-* e preserva preferências do aparelho", () => {
    const s = storageFalso({
      "pd-financas-despesas": "[]",
      "pd-sync:uid-1:despesas": "{}",
      "pd-notificacoes": "[]",
      "pd-concierge-preenchimento": "null",
      "duoplanner-theme": "dark",
      "duoplanner-pwa-dispensado": "123",
      "outra-app": "x",
    });
    expect(limparChavesDoStorage(s)).toBe(4);
    expect(s.chaves()).toEqual(["duoplanner-pwa-dispensado", "duoplanner-theme", "outra-app"]);
  });

  it("não pula chaves ao remover enquanto itera (índices mudam)", () => {
    const s = storageFalso(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`pd-${i}`, "1"])));
    expect(limparChavesDoStorage(s)).toBe(10);
    expect(s.length).toBe(0);
  });
});

describe("cacheDoUsuario (Service Worker)", () => {
  it("apaga só os caches com dados do usuário", () => {
    expect(cacheDoUsuario("pd-paginas-v1")).toBe(true);
    expect(cacheDoUsuario("pd-dados-v1")).toBe(true);
    expect(cacheDoUsuario("pd-estatico-v1")).toBe(false);
  });
});
