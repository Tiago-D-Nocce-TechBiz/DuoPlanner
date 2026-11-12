import { expect, test } from "@playwright/test";
import { abrirPainel } from "./apoio";

/** Remoção com "Desfazer" (5 s) e o selo de sincronização do cabeçalho. */

test("checklist: remover, desfazer e, depois do prazo, a remoção vale (inclusive após recarregar)", async ({ page }) => {
  await abrirPainel(page, "/dashboard/checklist");
  await page.getByLabel("Novo item").fill("Protetor solar");
  await page.getByRole("button", { name: "+ Adicionar" }).click();
  const item = page.getByText("Protetor solar", { exact: true });
  await expect(item).toBeVisible();

  await page.getByRole("button", { name: "Remover Protetor solar" }).click();
  await expect(item).toBeHidden();
  const aviso = page.locator("[data-toast-desfazer]");
  await expect(aviso).toContainText("“Protetor solar” saiu do checklist.");
  await aviso.getByRole("button", { name: "Desfazer" }).click();
  await expect(item).toBeVisible();
  await expect(aviso).toBeHidden();

  await page.getByRole("button", { name: "Remover Protetor solar" }).click();
  await expect(aviso).toBeVisible();
  await expect(aviso).toBeHidden({ timeout: 8_000 });
  await expect(item).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Checklist de Viagem" })).toBeVisible();
  await expect(page.getByText("Protetor solar", { exact: true })).toBeHidden();
});

test("sair da tela antes do prazo também efetiva a remoção", async ({ page }) => {
  await abrirPainel(page, "/dashboard/checklist");
  await page.getByLabel("Novo item").fill("Adaptador de tomada");
  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await page.getByRole("button", { name: "Remover Adaptador de tomada" }).click();
  await expect(page.locator("[data-toast-desfazer]")).toBeVisible();

  await page.getByRole("link", { name: "Roteiro" }).click();
  await expect(page.getByRole("heading", { name: "Roteiro", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Checklist" }).click();
  await expect(page.getByRole("heading", { name: "Checklist de Viagem" })).toBeVisible();
  await expect(page.getByText("Adaptador de tomada", { exact: true })).toBeHidden();
});

test("DuoFinance: o gasto removido some da lista E dos totais na hora; desfazer devolve os dois", async ({ page }) => {
  await abrirPainel(page, "/dashboard/financas");
  await page.getByLabel("Descrição").fill("Jantar no Bairro Alto");
  await page.getByLabel("Valor", { exact: true }).fill("10,01");
  await page.getByRole("button", { name: "Registrar lançamento" }).click();

  const linha = page.getByText("Jantar no Bairro Alto", { exact: true });
  await expect(linha).toBeVisible();
  const totalViagem = page.locator("p", { hasText: /^R\$\s?10,01$/ }).first();
  await expect(totalViagem).toBeVisible();
  // Sua parte no 50/50 com centavo ímpar: R$ 5,01 (quem é dono fica com o centavo).
  await expect(page.getByText(/^R\$\s?5,01$/)).toBeVisible();

  await page.getByRole("button", { name: "Remover Jantar no Bairro Alto" }).click();
  await expect(linha).toBeHidden();
  await expect(page.getByText(/^R\$\s?10,01$/)).toHaveCount(0);
  await page.locator("[data-toast-desfazer]").getByRole("button", { name: "Desfazer" }).click();
  await expect(linha).toBeVisible();
  await expect(totalViagem).toBeVisible();
});

test("DuoFinance: troca de categoria e 🔒 Privado / 👥 Compartilhado na própria linha", async ({ page }) => {
  await abrirPainel(page, "/dashboard/financas");
  await page.getByLabel("Descrição").fill("Museu do Azulejo");
  await page.getByLabel("Valor", { exact: true }).fill("40,00");
  await page.getByRole("button", { name: "Registrar lançamento" }).click();
  await expect(page.getByText("Museu do Azulejo", { exact: true })).toBeVisible();

  const categoria = page.getByLabel("Categoria de Museu do Azulejo");
  await categoria.selectOption("Passeios & Lazer");
  await expect(categoria).toHaveValue("Passeios & Lazer");

  await page.getByRole("button", { name: "Compartilhado" }).click();
  await expect(page.getByText("Museu do Azulejo", { exact: true })).toBeHidden(); // foi para a aba Pessoais
  await page.getByRole("tab", { name: /Pessoais/ }).click();
  await expect(page.getByText("Museu do Azulejo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Privado" })).toBeVisible();
});

test("selo do cabeçalho: modo local e Offline (Salvo neste aparelho)", async ({ page, context }) => {
  await abrirPainel(page, "/dashboard");
  const selo = page.locator("[data-sync-badge]");
  await expect(selo).toHaveAttribute("data-estado", "local");
  await expect(selo).toContainText("Salvo neste aparelho (modo local)");

  await context.setOffline(true);
  await expect(selo).toHaveAttribute("data-estado", "offline");
  await expect(selo).toContainText("Offline (Salvo neste aparelho)");
  // Com o cabeçalho à vista, o aviso flutuante não repete a mesma informação.
  await expect(page.locator("[data-aviso-offline]")).toHaveCount(0);

  await context.setOffline(false);
  await expect(selo).toHaveAttribute("data-estado", "local");
});

test("celular: o selo vira só o ícone (Offline mantém a palavra) e o cabeçalho não transborda", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirPainel(page, "/dashboard");
  const selo = page.locator("[data-sync-badge]");
  await expect(selo).toBeVisible();
  await expect(selo.getByText("Salvo neste aparelho (modo local)")).toBeHidden();

  await context.setOffline(true);
  await expect(selo.getByText("Offline", { exact: true })).toBeVisible();
  const transborda = await page.evaluate(() => {
    const cabecalho = document.querySelector("[data-cabecalho-painel]")!;
    return cabecalho.scrollWidth > cabecalho.clientWidth + 1;
  });
  expect(transborda).toBe(false);
  await context.setOffline(false);
});
