import { defineConfig } from "@playwright/test";

/**
 * Testes de navegador (fluxos de tela) — `npm run test:e2e`.
 *
 * Usam o Microsoft Edge instalado no sistema (`channel: "msedge"`): nada de
 * baixar navegadores para dentro do projeto. O servidor de desenvolvimento
 * sobe SEM Supabase (variáveis vazias vencem o .env.local), que é o modo em
 * que o painel abre sem login; os testes montam o contexto do casal no
 * aparelho e cortam as Server Actions para exercitar o modo offline/local.
 *
 * Exceção: `importador-producao.spec.ts` cronometra o importador com o React
 * de produção, num pacote próprio servido pelo próprio teste (sem servidor).
 *
 * Fora do `npm test` de propósito: precisam do servidor e levam ~2 min.
 */
const PORTA = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${PORTA}`,
    channel: "msedge",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${PORTA}`,
    url: `http://localhost:${PORTA}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SECRET_KEY: "",
    },
  },
});
