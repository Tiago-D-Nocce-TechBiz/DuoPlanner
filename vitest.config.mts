import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes unitários das regras de negócio puras (parser de viagem, deep links,
 * importação de fatura, classificador, roteador da Nora). Componentes React e
 * acesso ao banco ficam fora: aqui só entra lógica determinística.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
