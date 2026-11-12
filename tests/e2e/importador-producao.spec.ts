import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { build } from "rolldown";
import { arquivoFatura, faturaComCompras } from "./apoio";

/**
 * Fase 1 do importador (arquivo lido → Raio-X e tabela no DOM) em menos de
 * 100 ms, medida com o React de PRODUÇÃO.
 *
 * Os outros testes rodam no servidor de desenvolvimento, em que o React é
 * várias vezes mais lento (jsxDEV, owner stacks, StrictMode): serve para o
 * fluxo, não para cronometrar. Aqui o importador é empacotado sozinho
 * (rolldown, NODE_ENV=production) com o motor, o store e a Server Action
 * trocados por `producao/substitutos.ts`, e servido em http://localhost por
 * `page.route` (contexto seguro: há Web Crypto para o fingerprint, e nenhum
 * servidor é preciso). A medida é a marca `duofinance:fase1` do componente.
 */

const ORIGEM = "http://localhost:39999";
const HTML = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body><div id="raiz"></div><script src="/importador.js"></script>';
const SUBSTITUIDOS = new Set(["@/lib/sync/motor", "@/lib/finance/store", "@/app/dashboard/financas/analyze-invoice"]);

let pacote = "";

test.beforeAll(async ({}, info) => {
  const raiz = path.dirname(info.config.configFile!);
  const substitutos = path.join(raiz, "tests/e2e/producao/substitutos.ts");
  const { output } = await build({
    input: path.join(raiz, "tests/e2e/producao/entrada.tsx"),
    cwd: raiz,
    platform: "browser",
    write: false,
    plugins: [{ name: "substitutos", resolveId: (id) => (SUBSTITUIDOS.has(id) ? substitutos : null) }],
    resolve: { alias: { "@": path.join(raiz, "src") } },
    transform: {
      jsx: { runtime: "automatic", development: false },
      define: { "process.env.NODE_ENV": '"production"' },
    },
    output: { format: "iife", minify: true },
    // "use client" não significa nada num pacote só de navegador.
    onLog: (nivel, log) => {
      if (log.code !== "MODULE_LEVEL_DIRECTIVE") throw new Error(`[rolldown] ${nivel}: ${log.message}`);
    },
  });
  pacote = output[0].code;
});

async function abrirImportador(page: Page) {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.route(`${ORIGEM}/**`, (route) =>
    route.request().url().endsWith("/importador.js")
      ? route.fulfill({ contentType: "text/javascript", body: pacote })
      : route.fulfill({ contentType: "text/html", body: HTML })
  );
  await page.goto(`${ORIGEM}/`);
  await expect(page.locator('input[type="file"][accept*=".csv"]')).toBeAttached();
  expect(erros).toEqual([]);
}

for (const compras of [8, 80, 200]) {
  test(`fase 1 com ${compras} compras: mediana abaixo de 100 ms`, async ({ page }) => {
    await abrirImportador(page);
    const entrada = page.locator('input[type="file"][accept*=".csv"]');
    const medidas: number[] = [];
    for (let rodada = 0; rodada < 5; rodada++) {
      await entrada.setInputFiles(arquivoFatura(faturaComCompras(compras)));
      await expect(page.locator("[data-revisao-fatura]")).toBeVisible();
      medidas.push(await page.evaluate(() => performance.getEntriesByName("duofinance:fase1").at(-1)?.duration ?? NaN));
      // Fatura longa entra em levas depois da primeira pintura: no fim, todas as linhas estão lá.
      await expect(page.locator("[data-linha-fatura]")).toHaveCount(compras);
      await page.getByRole("button", { name: "Cancelar" }).click();
    }
    test.info().annotations.push({ type: "fase 1 (ms)", description: medidas.map((m) => m.toFixed(1)).join(" · ") });
    const mediana = [...medidas].sort((a, b) => a - b)[2];
    expect(mediana, `medidas: ${medidas.map((m) => m.toFixed(1)).join(", ")} ms`).toBeLessThan(100);
  });
}

test("fatura longa: a primeira pintura leva só as primeiras linhas; o resto entra em seguida", async ({ page }) => {
  await abrirImportador(page);
  // Conta as linhas no instante exato da medida da fase 1 (dentro do commit).
  await page.evaluate(() => {
    const medir = performance.measure.bind(performance);
    performance.measure = ((...args: Parameters<Performance["measure"]>) => {
      const entrada = medir(...args);
      if (args[0] === "duofinance:fase1") {
        (window as unknown as { linhasNaFase1: number }).linhasNaFase1 = document.querySelectorAll("[data-linha-fatura]").length;
      }
      return entrada;
    }) as Performance["measure"];
  });
  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles(arquivoFatura(faturaComCompras(300)));
  await expect(page.locator("[data-revisao-fatura]")).toBeVisible();
  const naPrimeiraPintura = await page.evaluate(() => (window as unknown as { linhasNaFase1?: number }).linhasNaFase1);
  expect(naPrimeiraPintura).toBeGreaterThan(0);
  expect(naPrimeiraPintura).toBeLessThanOrEqual(50);
  await expect(page.locator("[data-linha-fatura]")).toHaveCount(300);
  // O Raio-X soma todas as compras desde o início, não só as montadas.
  await expect(page.getByText("· 300 compras")).toBeVisible();
});
