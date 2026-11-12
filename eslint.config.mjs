import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Ambiente: toda leitura passa por src/lib/env (validado com zod, com
  // fail-fast no boot). Ler process.env direto espalha regras e esconde
  // valores malformados; o instrumentation.ts precisa de NEXT_RUNTIME.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/env/**", "src/instrumentation.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Leia variáveis de ambiente por @/lib/env (servidor) ou @/lib/env/publico (navegador).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefatos de testes (nunca versionados):
    ".tmp-e2e/**",
    ".tmp-*/**",
    "playwright-report/**",
    "blob-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
