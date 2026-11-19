import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Integração com o Gemini REAL (opt-in): `npm run test:integracao`.
 *
 * Fica fora do `npm test` de propósito (cota, rede e custo). Sem
 * `GEMINI_API_KEY` no ambiente (ou no `.env.local`), os testes são pulados
 * e o comando sai com sucesso. A chave nunca é lida pelo código do app fora
 * de `src/lib/env`: aqui ela só é repassada ao processo de teste.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/integracao/**/*.integracao.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    env: loadEnv("test", process.cwd(), ["GEMINI_"]),
  },
});
