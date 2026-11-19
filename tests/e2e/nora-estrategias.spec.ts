import { expect, test, type Page } from "@playwright/test";
import { abrirPainel } from "./apoio";

/**
 * Ferramentas de viagem da Nora na gaveta: carrossel de atalhos, menu "/" e
 * o card da análise. As Server Actions falham como sem rede (`abrirPainel`),
 * então o que aparece é a lista de conferência local, que é justamente o
 * caminho offline que precisa funcionar sem quebrar a gaveta.
 */
async function abrirNora(page: Page) {
  await abrirPainel(page, "/dashboard");
  await page.getByRole("button", { name: "Perguntar à Nora" }).click();
  const nora = page.getByRole("dialog", { name: "Nora — assistente de IA" });
  await expect(nora.getByRole("group", { name: "Ferramentas de economia de viagem da Nora" })).toBeVisible();
  return nora;
}

test("carrossel mostra as 9 ferramentas e o clique devolve o card local, sem quebrar", async ({ page }) => {
  const nora = await abrirNora(page);
  const atalhos = nora.locator("[data-nora-atalhos] button");
  await expect(atalhos).toHaveCount(9);

  await nora.getByRole("button", { name: "Auditar Voo" }).click();
  const card = nora.locator('[data-nora-analise="auditoria_voo"]');
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(card).toHaveAttribute("data-origem", "local");
  await expect(card.getByText("Sem conexão com a Nora agora")).toBeVisible();
  await expect(card.getByRole("button", { name: "Salvar Dica no Roteiro" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Criar Alerta de Preço" })).toBeVisible();
  await expect(card.getByText(/Lista de conferência geral, sem preços/)).toBeVisible();
});

test('digitar "/" abre o menu, filtra na hora e Enter completa o comando', async ({ page }) => {
  const nora = await abrirNora(page);
  const caixa = nora.getByPlaceholder(/Insira sua pergunta/);
  await caixa.fill("/");
  const menu = nora.getByRole("listbox", { name: "Comandos da Nora" });
  await expect(menu.getByRole("option")).toHaveCount(9);

  await caixa.fill("/aud");
  await expect(menu.getByRole("option")).toHaveCount(1);
  await expect(menu.getByRole("option").first()).toContainText("/auditar-voo");

  await caixa.press("Enter");
  await expect(caixa).toHaveValue("/auditar-voo ");
  await expect(menu).toHaveCount(0);
});

test("Esc fecha só o menu; a gaveta continua aberta. Setas trocam o item ativo", async ({ page }) => {
  const nora = await abrirNora(page);
  const caixa = nora.getByPlaceholder(/Insira sua pergunta/);
  await caixa.fill("/");
  const menu = nora.getByRole("listbox", { name: "Comandos da Nora" });
  await expect(menu.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await caixa.press("ArrowDown");
  await expect(menu.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");

  await caixa.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(nora).toBeVisible();
});

test("comando completo digitado vai para a ferramenta; comando desconhecido segue como pergunta normal", async ({ page }) => {
  const nora = await abrirNora(page);
  const caixa = nora.getByPlaceholder(/Insira sua pergunta/);
  await caixa.fill("/verificar-taxas Lisboa");
  await caixa.press("Enter");
  await expect(nora.locator('[data-nora-analise="verificacao_taxas"]')).toBeVisible({ timeout: 5000 });

  await caixa.fill("/xyz qualquer coisa");
  await expect(nora.getByRole("listbox")).toHaveCount(0);
  await caixa.press("Enter");
  await expect(nora.locator("[data-nora-resposta]").last()).toBeVisible({ timeout: 5000 });
});
