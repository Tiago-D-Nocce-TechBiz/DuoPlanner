import { expect, test, type Page } from "@playwright/test";
import { abrirPainel, copiaDoMotor } from "./apoio";

/**
 * Ferramentas de viagem da Nora na gaveta: carrossel de atalhos, menu "/" e
 * o card da análise. As Server Actions falham como sem rede (`abrirPainel`),
 * então o que aparece é a lista de conferência local, que é justamente o
 * caminho offline que precisa funcionar sem quebrar a gaveta.
 */
async function abrirNora(page: Page, armazenamento: Record<string, string> = {}) {
  await abrirPainel(page, "/dashboard", { armazenamento });
  await page.getByRole("button", { name: "Perguntar à Nora" }).click();
  const nora = page.getByRole("dialog", { name: "Nora — assistente de IA" });
  await expect(nora.getByRole("group", { name: "Ferramentas de economia de viagem da Nora" })).toBeVisible();
  return nora;
}

test("carrossel mostra as 10 ferramentas e o clique devolve o card local, sem quebrar", async ({ page }) => {
  const nora = await abrirNora(page);
  const atalhos = nora.locator("[data-nora-atalhos] button");
  await expect(atalhos).toHaveCount(10);

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
  await expect(menu.getByRole("option")).toHaveCount(10);

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

test("gestão de custos offline: números do aparelho (só gastos compartilhados), painel e sinais", async ({ page }) => {
  const nora = await abrirNora(page, copiaDoMotor({ gastos: 40 }));
  await nora.getByRole("button", { name: "Gestão de Custos" }).click();
  const card = nora.locator('[data-nora-analise="gestao_custos"]');
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toHaveAttribute("data-origem", "local");
  await expect(card.getByText("Sem conexão com a Nora agora")).toBeVisible();
  await expect(card.getByText("calculados com os dados guardados neste aparelho")).toBeVisible();

  // 40 gastos semeados, 5 deles privados (nunca entram): 35 lançamentos compartilhados.
  const painel = card.locator("[data-nora-custos]");
  await expect(painel).toBeVisible();
  await expect(painel).toContainText("35 lançamentos");
  await expect(card.getByText(/Vocês já lançaram R\$\s?[\d.]+,\d{2} em 35 gastos compartilhados/)).toBeVisible();
  await expect(painel.getByText("Onde o dinheiro foi")).toBeVisible();
  await expect(painel.locator("li")).not.toHaveCount(0);
  await expect(painel.locator("[data-nora-previsao]")).toContainText("Previsão comprometida");
  await expect(card.getByText("Cálculo do app")).toBeVisible();
  await expect(card.getByText(/Totais calculados pelo DuoPlanner/)).toBeVisible();
  // Não faz sentido criar alerta de preço a partir de custos; salvar dica continua.
  await expect(card.getByRole("button", { name: "Criar Alerta de Preço" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Salvar Dica no Roteiro" })).toBeVisible();
});

test("gestão de custos sem nenhum lançamento: ensina a começar", async ({ page }) => {
  const nora = await abrirNora(page);
  const caixa = nora.getByPlaceholder(/Insira sua pergunta/);
  await caixa.fill("/custos");
  await caixa.press("Enter"); // completa o comando
  await caixa.press("Enter"); // envia
  const card = nora.locator('[data-nora-analise="gestao_custos"]');
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.getByText("Ainda não há gastos compartilhados lançados nem custos estimados")).toBeVisible();
  await expect(card.getByText("Lance os gastos da viagem como compartilhados")).toBeVisible();
});
