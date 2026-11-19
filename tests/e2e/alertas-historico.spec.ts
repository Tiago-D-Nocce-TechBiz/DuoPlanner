import { expect, test, type Page } from "@playwright/test";
import { abrirPainel } from "./apoio";

/**
 * Histórico de preços dos Alertas do DuoPlanner. A resposta da Server Action
 * é simulada na rede (mesmo formato de fio da resposta real); sem ela, as
 * ações ficam sem rede, como no `abrirPainel`.
 */

async function simularHistorico(page: Page, pontos: { dia: string; preco: number }[]) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || !req.headers()["next-action"] || !(req.postData() ?? "").includes("alertaId")) return route.fallback();
    const resultado = { success: true, data: { pontos } };
    return route.fulfill({
      status: 200,
      contentType: "text/x-component",
      body: `0:{"a":"$@1","q":"","i":true,"b":"development"}\n1:${JSON.stringify(resultado)}\n`,
    });
  });
}

async function criarAlerta(page: Page) {
  await abrirPainel(page, "/dashboard/alertas");
  await page.getByLabel("Origem").fill("São Paulo");
  await page.getByLabel("Destino", { exact: true }).fill("Lisboa");
  await page.locator("#alerta-ida").fill("2031-09-10");
  await page.getByLabel("Preço-alvo").fill("1800");
  await page.getByRole("button", { name: "+ Criar alerta" }).click();
  await expect(page.getByRole("button", { name: "Ver histórico de preços" })).toBeVisible();
}

const SERIE = [
  { dia: "2026-09-01", preco: 2000 },
  { dia: "2026-09-02", preco: 1900 },
  { dia: "2026-09-03", preco: 2100 },
  { dia: "2026-09-04", preco: 1750 },
];

test("histórico: resumo, menor preço visto, variação, dias no alvo e gráfico acessível", async ({ page }) => {
  await criarAlerta(page);
  await simularHistorico(page, SERIE);
  await page.getByRole("button", { name: "Ver histórico de preços" }).click();

  const historico = page.locator("[data-historico-preco]");
  await expect(historico).toBeVisible({ timeout: 15_000 });
  await expect(historico).toContainText(/Hoje\s*R\$\s*1\.750,00/);
  await expect(historico).toContainText(/Menor preço visto\s*R\$\s*1\.750,00\s*em 04\/09\/2026/);
  await expect(historico).toContainText("-12,5%");
  await expect(historico).toContainText("Caindo");
  await expect(historico).toContainText("O preço de hoje é o menor já visto");
  await expect(historico).toContainText("No alvo ou abaixo em 1 dia");
  await expect(historico.getByRole("img", { name: /Gráfico de preços: de R\$\s*2\.000,00 em 01\/09\/2026 a R\$\s*1\.750,00/ })).toBeVisible();
  await expect(historico.locator("table tbody tr")).toHaveCount(4);

  await page.getByRole("button", { name: "Ocultar histórico" }).click();
  await expect(historico).toHaveCount(0);
});

test("sem histórico ainda: explica quando o primeiro preço entra", async ({ page }) => {
  await criarAlerta(page);
  await simularHistorico(page, []);
  await page.getByRole("button", { name: "Ver histórico de preços" }).click();
  await expect(page.locator("[data-historico-vazio]")).toContainText("Ainda sem histórico");
});

test("sem conexão: mostra o aviso e 'Tentar de novo' busca de novo", async ({ page }) => {
  await criarAlerta(page);
  await page.getByRole("button", { name: "Ver histórico de preços" }).click();
  const aviso = page.getByRole("alert").filter({ hasText: "Sem conexão agora" });
  await expect(aviso).toBeVisible({ timeout: 15_000 });

  await simularHistorico(page, SERIE);
  await aviso.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.locator("[data-historico-preco]")).toContainText("Menor preço visto", { timeout: 15_000 });
});
