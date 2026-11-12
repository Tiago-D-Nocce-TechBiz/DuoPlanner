import { expect, test } from "@playwright/test";
import { abrirPainel, arquivoFatura, COMPRAS_NA_FATURA, FATURA } from "./apoio";

/**
 * Importador de faturas do DuoFinance em duas fases: tabela local na hora,
 * IA em segundo plano sem travar, arrastar e soltar e reimportação.
 */

const revisao = (page: import("@playwright/test").Page) => page.locator("[data-revisao-fatura]");

/** Quanto a Server Action da IA demora a "cair" no teste da fase 1. */
const ATRASO_IA_MS = 4000;

// O limite de 100 ms vale para o React de produção e é cobrado em
// `importador-producao.spec.ts`. Aqui, no servidor de desenvolvimento, o
// teste prova a ordem: a tabela e o Raio-X ficam prontos enquanto a IA ainda
// nem respondeu.
test("fase 1: Raio-X e tabela prontos antes de a IA responder", async ({ page }) => {
  await abrirPainel(page, "/dashboard/financas", { atrasoMs: ATRASO_IA_MS });
  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles(arquivoFatura());

  await expect(revisao(page)).toBeVisible();
  await expect(page.locator("[data-linha-fatura]")).toHaveCount(COMPRAS_NA_FATURA);
  // O Raio-X já está calculado: soma em centavos das 8 compras (o pagamento
  // da fatura fica de fora), com separador de milhar.
  await expect(page.getByText(/^R\$\s?1\.674,67$/)).toBeVisible();
  // ...e a IA ainda está trabalhando nas compras que o catálogo não reconheceu.
  await expect(page.locator('[data-linha-fatura][aria-busy="true"]')).toHaveCount(3);

  const duracao = await page.evaluate(() => performance.getEntriesByName("duofinance:fase1").at(-1)?.duration ?? null);
  expect(duracao, "medição da fase 1 (User Timing)").not.toBeNull();
  expect(duracao!).toBeLessThan(ATRASO_IA_MS);
});

test("fase 2: só as não reconhecidas esperam a IA, com esqueleto, e nada fica travado", async ({ page }) => {
  await abrirPainel(page, "/dashboard/financas", { atrasoMs: 2500 });
  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles(arquivoFatura());
  await expect(revisao(page)).toBeVisible();

  const aguardando = page.locator('[data-linha-fatura][aria-busy="true"]');
  // Padaria, posto (genérico) e a loja parcelada desconhecida; Uber, iFood,
  // Magazine Luiza e Netflix saem do catálogo local.
  await expect(aguardando).toHaveCount(3);
  await expect(page.getByText(/Refinando 3 compras com IA/)).toBeVisible();

  // Enquanto a IA trabalha, dá para editar.
  const padaria = page.locator("[data-linha-fatura]", { hasText: "PADARIA DO ZE" });
  await padaria.getByLabel(/Categoria de/).selectOption("Alimentação");

  // A IA "cai" (Server Action sem rede): as linhas ficam com a categoria local.
  await expect(aguardando).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText("Sem conexão com o servidor: mantivemos a categorização local.")).toBeVisible();
  await expect(padaria.getByLabel(/Categoria de/)).toHaveValue("Alimentação");
  await expect(page.getByRole("button", { name: `Salvar ${COMPRAS_NA_FATURA} no DuoFinance` })).toBeEnabled();
});

test("arrastar e soltar abre a revisão; arquivo solto fora da área não sai da página", async ({ page }) => {
  await abrirPainel(page, "/dashboard/financas");
  const zona = page.locator("[data-zona-arquivo]");
  await expect(zona).toBeVisible();

  const foraFoiBarrado = await page.evaluate((conteudo) => {
    const dados = new DataTransfer();
    dados.items.add(new File([conteudo], "fatura.csv", { type: "text/csv" }));
    const evento = new DragEvent("drop", { dataTransfer: dados, bubbles: true, cancelable: true });
    document.querySelector("h1")!.dispatchEvent(evento);
    return evento.defaultPrevented;
  }, FATURA);
  expect(foraFoiBarrado, "drop fora da área é barrado (o navegador não abre o arquivo)").toBe(true);

  const dados = await page.evaluateHandle((conteudo) => {
    const dt = new DataTransfer();
    dt.items.add(new File([conteudo], "fatura.csv", { type: "text/csv" }));
    return dt;
  }, FATURA);
  await zona.dispatchEvent("dragenter", { dataTransfer: dados });
  await expect(zona).toContainText("Solte o arquivo para analisar");
  await zona.dispatchEvent("drop", { dataTransfer: dados });
  await expect(revisao(page)).toBeVisible();
  await expect(page.locator("[data-linha-fatura]")).toHaveCount(COMPRAS_NA_FATURA);
});

test("formato errado é recusado com explicação", async ({ page }) => {
  await abrirPainel(page, "/dashboard/financas");
  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({
    name: "fatura.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7"),
  });
  await expect(page.getByText("Formato não suportado. Envie o arquivo CSV ou TXT da fatura.")).toBeVisible();
});

test("reimportar a mesma fatura: tudo marcado como já importado e nada é salvo de novo", async ({ page }) => {
  await abrirPainel(page, "/dashboard/financas");
  const entrada = page.locator('input[type="file"][accept*=".csv"]');

  await entrada.setInputFiles(arquivoFatura());
  await page.getByRole("button", { name: `Salvar ${COMPRAS_NA_FATURA} no DuoFinance` }).click();
  await expect(page.getByText(`${COMPRAS_NA_FATURA} gastos salvos no DuoFinance`)).toBeVisible();

  await page.getByRole("button", { name: "Importar outra fatura" }).click();
  await entrada.setInputFiles(arquivoFatura());
  await expect(revisao(page)).toBeVisible();
  await expect(page.getByText("Já importado anteriormente (Ignorado).")).toHaveCount(COMPRAS_NA_FATURA);
  await expect(page.getByRole("button", { name: "Nada novo para salvar" })).toBeDisabled();

  // "Importar mesmo assim" numa das corridas iguais: só ela entra.
  const uber = page.locator("[data-linha-fatura]", { hasText: "PG *UBER *TRIP" }).first();
  await uber.getByRole("button", { name: "Importar mesmo assim" }).click();
  await expect(uber).toContainText("Será importado de novo");
  await page.getByRole("button", { name: "Salvar 1 no DuoFinance" }).click();
  await expect(page.getByText("1 gasto salvo no DuoFinance")).toBeVisible();
  await expect(page.getByText("7 compras já estavam no DuoFinance e não foram salvas de novo.")).toBeVisible();
});
