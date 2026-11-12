import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
/**
 * Testes unitários das regras de negócio puras (parser de viagem, deep links,
 * importação de fatura, dinheiro, classificador, roteador da Nora) e, em
 * `tests/sql`, as migrations num Postgres de verdade (PGlite, WASM: sem
 * binário local nem rede). Componentes React ficam fora: o fluxo de tela é
 * coberto pelos testes de navegador (`npm run test:e2e`, Playwright).
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/sql/**/*.test.ts"],
    environment: "node",
    // O Postgres em WASM leva alguns segundos para subir e aplicar as migrations.
    hookTimeout: 120_000,
  },
});
