import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { arquivoFatura, faturaComCompras } from "./apoio";
import { alturasDasLinhas, frearCpu, rolarAteOFim } from "./medicao";
import { montarCss, montarPacote, paginaDoPacote } from "./producao/montar";

/**
 * Fase 1 do importador (arquivo lido → Raio-X e tabela no DOM) em menos de
 * 100 ms, medida com o React de PRODUÇÃO.
 *
 * Os outros testes rodam no servidor de desenvolvimento, em que o React é
 * várias vezes mais lento (jsxDEV, owner stacks, StrictMode): serve para o
 * fluxo, não para cronometrar. Aqui o importador é empacotado sozinho
 * (rolldown, NODE_ENV=production) com o motor, o store e a Server Action
 * trocados por `producao/substitutos.ts`, com o CSS real do app, e servido
 * em http://localhost por `page.route` (contexto seguro: há Web Crypto para
 * o fingerprint, e nenhum servidor é preciso). A medida é a marca
 * `duofinance:fase1` do componente.
 */

const ORIGEM = "http://localhost:39999";
const SUBSTITUTOS = "tests/e2e/producao/substitutos.ts";

let servir: ReturnType<typeof paginaDoPacote>;

test.beforeAll(async ({}, info) => {
  const raiz = path.dirname(info.config.configFile!);
  const [js, css] = await Promise.all([
    montarPacote(raiz, "tests/e2e/producao/entrada.tsx", {
      "@/lib/sync/motor": SUBSTITUTOS,
      "@/lib/finance/store": SUBSTITUTOS,
      "@/app/dashboard/financas/analyze-invoice": SUBSTITUTOS,
    }),
    montarCss(raiz),
  ]);
  servir = paginaDoPacote({ js, css });
});

// Sem trace: o Playwright fotografa o DOM a cada ação, na thread principal.
test.use({ trace: "off" });

async function abrirImportador(page: Page) {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.route(`${ORIGEM}/**`, (route) => route.fulfill(servir(route.request().url())));
  await page.goto(`${ORIGEM}/`);
  await expect(page.locator('input[type="file"][accept*=".csv"]')).toBeAttached();
  expect(erros).toEqual([]);
}

/** Importa `compras` compras `rodadas` vezes e devolve as medidas da fase 1 (ms). */
async function medirFase1(page: Page, compras: number, rodadas: number): Promise<number[]> {
  const entrada = page.locator('input[type="file"][accept*=".csv"]');
  const medidas: number[] = [];
  for (let rodada = 0; rodada < rodadas; rodada++) {
    await entrada.setInputFiles(arquivoFatura(faturaComCompras(compras)));
    await expect(page.locator("[data-revisao-fatura]")).toBeVisible();
    medidas.push(await page.evaluate(() => performance.getEntriesByName("duofinance:fase1").at(-1)?.duration ?? NaN));
    // Fatura longa entra em levas depois da primeira pintura: no fim, todas as linhas estão lá.
    await expect(page.locator("[data-linha-fatura]")).toHaveCount(compras);
    await page.getByRole("button", { name: "Cancelar" }).click();
  }
  return medidas;
}

const mediana = (lista: number[]) => [...lista].sort((a, b) => a - b)[Math.floor(lista.length / 2)];
const texto = (lista: number[]) => lista.map((m) => m.toFixed(1)).join(" · ");

for (const compras of [8, 80, 200]) {
  test(`fase 1 com ${compras} compras: mediana abaixo de 100 ms`, async ({ page }) => {
    await abrirImportador(page);
    const medidas = await medirFase1(page, compras, 5);
    test.info().annotations.push({ type: "fase 1 (ms)", description: texto(medidas) });
    expect(mediana(medidas), `medidas: ${texto(medidas)} ms`).toBeLessThan(100);
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

test.describe("celular lento (390 × 844, CPU 4x)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  // O teto de 100 ms com a CPU normal, escalado pela CPU 4x mais lenta.
  // Medido (React de produção, Edge): medianas de 190 a 270 ms entre
  // execuções; o código da fase 1 roda pouco e ainda sem otimização do JIT,
  // então cai para ~130 ms depois de várias importações na mesma página.
  test("fase 1 com 200 compras com a CPU 4x mais lenta: mediana abaixo de 400 ms", async ({ page }) => {
    await abrirImportador(page);
    await medirFase1(page, 8, 1); // aquecimento: a 1ª importação compila o caminho todo
    await frearCpu(page);
    const medidas = await medirFase1(page, 200, 5);
    test.info().annotations.push({ type: "fase 1, CPU 4x (ms)", description: texto(medidas) });
    expect(mediana(medidas), `medidas: ${texto(medidas)} ms`).toBeLessThan(400);
  });

  test("revisão com 200 compras: rolagem no ritmo da tela, sem tarefa longa", async ({ page }) => {
    await abrirImportador(page);
    await page.locator('input[type="file"][accept*=".csv"]').setInputFiles(arquivoFatura(faturaComCompras(200)));
    await expect(page.locator("[data-linha-fatura]")).toHaveCount(200);
    await frearCpu(page);
    const r = await rolarAteOFim(page);
    test.info().annotations.push({ type: "rolagem, CPU 4x", description: `${r.quadros} quadros · p95 ${r.p95.toFixed(1)} ms · ${r.longas} tarefas longas · ${r.alvo}px` });
    expect(r.alvo).toBeGreaterThan(10_000);
    expect(r.p95).toBeLessThan(25);
    expect(r.longas).toBe(0);
  });
});

test("linhas da revisão: a altura reservada fora da tela é a real (celular, tablet e computador)", async ({ page }) => {
  const resultados: Record<string, Awaited<ReturnType<typeof alturasDasLinhas>>> = {};
  for (const [nome, largura] of [["celular", 390], ["tablet", 768], ["computador", 1280]] as const) {
    await page.setViewportSize({ width: largura, height: 844 });
    await abrirImportador(page);
    await page.locator('input[type="file"][accept*=".csv"]').setInputFiles(arquivoFatura(faturaComCompras(80)));
    await expect(page.locator("[data-linha-fatura]")).toHaveCount(80);
    resultados[nome] = await alturasDasLinhas(page, "[data-linha-fatura]");
    await page.getByRole("button", { name: "Cancelar" }).click();
  }
  test.info().annotations.push({ type: "altura das linhas (px)", description: JSON.stringify(resultados) });
  for (const [nome, r] of Object.entries(resultados)) {
    expect(Math.abs(r.reservada - r.mediana) / r.mediana, `${nome}: ${JSON.stringify(r)}`).toBeLessThan(0.15);
  }
});
