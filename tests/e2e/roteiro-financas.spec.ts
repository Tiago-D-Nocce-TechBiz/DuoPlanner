import { expect, test, type Page } from "@playwright/test";
import { abrirPainel } from "./apoio";

/**
 * Roteiro do DuoPlanner: ordem manual (mesma data ou sem data) e envio do
 * custo estimado para o DuoFinance, com confirmação e sem duplicar.
 */

const CSV = [
  "Destino;Data;Turno_ou_Horario;Atividade_ou_Lugar;Categoria;Custo_Estimado;Observacoes",
  "Lisboa;2026-09-10;Manhã;Bondinho 28;Passeio;25;",
  "Lisboa;2026-09-10;20:00;Jantar no Time Out Market;Gastronomia;120;",
  "Cascais;2026-09-11;Tarde;Praia de Carcavelos;Praia;0;",
  "Cascais;2026-09-11;Noite;Táxi de volta;Transporte;45,50;",
  "Cascais;2026-09-11;Noite;Museu do Mar;Passeio;30;",
].join("\n");

async function abrirComRoteiro(page: Page) {
  await abrirPainel(page, "/dashboard/roteiro");
  await page.getByRole("button", { name: "Importar Planilha com a Nora" }).click();
  const dialogo = page.getByRole("dialog", { name: "Importar planilha com a Nora" });
  await dialogo.getByRole("checkbox", { name: /Pedir para a Nora sugerir/ }).uncheck();
  await dialogo.getByLabel("Arquivo da planilha (.xlsx ou .csv)").setInputFiles({ name: "v.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
  await dialogo.getByRole("button", { name: "Salvar 5 atividades no Roteiro" }).click({ timeout: 20_000 });
  await dialogo.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveCount(5);
}

const titulos = (dia: ReturnType<Page["getByRole"]>) => dia.getByLabel("Atividade", { exact: true }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test("ordem manual: sobe e desce atividades do dia, e dias sem data entre si", async ({ page }) => {
  await abrirComRoteiro(page);
  const dia1 = page.getByRole("region", { name: "Dia 1" });
  expect(await titulos(dia1)).toEqual(["Bondinho 28", "Jantar no Time Out Market"]);

  await dia1.getByRole("button", { name: "Mover atividade para baixo" }).first().click();
  await expect.poll(() => titulos(dia1)).toEqual(["Jantar no Time Out Market", "Bondinho 28"]);
  await dia1.getByRole("button", { name: "Mover atividade para cima" }).nth(1).click();
  await expect.poll(() => titulos(dia1)).toEqual(["Bondinho 28", "Jantar no Time Out Market"]);

  // Dias com datas diferentes seguem o calendário: não há botão de mover dia.
  await expect(page.getByRole("button", { name: /^Mover o dia \d para (cima|baixo)$/ })).toHaveCount(0);

  // Dois dias sem data: a ordem manual vale entre eles (e ficam depois dos com data).
  await page.getByRole("button", { name: "+ Adicionar dia" }).click();
  await page.getByRole("button", { name: "+ Adicionar dia" }).click();
  const sem1 = page.getByLabel("Destino do dia 3");
  const sem2 = page.getByLabel("Destino do dia 4");
  await sem1.fill("Primeiro");
  await sem2.fill("Segundo");
  await expect(page.getByRole("button", { name: "Mover o dia 3 para cima" })).toBeDisabled();
  await page.getByRole("button", { name: "Mover o dia 3 para baixo" }).click();
  await expect(page.getByLabel("Destino do dia 3")).toHaveValue("Segundo");
  await expect(page.getByLabel("Destino do dia 4")).toHaveValue("Primeiro");
  // Os dias com data não se mexeram.
  await expect(page.getByLabel("Destino do dia 1")).toHaveValue("Lisboa");
  await expect(page.getByLabel("Destino do dia 2")).toHaveValue("Cascais");
});

test("lançar nas Finanças: confirma escopo e valor, aparece no DuoFinance e não duplica", async ({ page }) => {
  await abrirComRoteiro(page);
  const dia1 = page.getByRole("region", { name: "Dia 1" });
  const jantar = dia1.locator("div.rounded-xl", { has: page.locator("input[value='Jantar no Time Out Market']") });

  await jantar.getByRole("button", { name: "Lançar nas Finanças" }).click();
  const dialogo = page.getByRole("dialog", { name: "Lançar nas Finanças" });
  await expect(dialogo.getByRole("radio", { name: /Compartilhado com a dupla/ })).toBeChecked();
  await expect(dialogo).toContainText(/R\$\s*120,00/);
  // Nada foi lançado até confirmar.
  await dialogo.getByLabel("Valor do gasto em reais").fill("130,00");
  await expect(dialogo).toContainText(/R\$\s*130,00/);
  await dialogo.getByRole("button", { name: "Confirmar lançamento" }).click();
  await expect(dialogo.locator("[data-lancamento-feito]")).toContainText("1 gasto lançado");

  await dialogo.getByRole("link", { name: "Ver no DuoFinance" }).click();
  await expect(page.getByText("Jantar no Time Out Market (Roteiro · Lisboa)", { exact: true })).toHaveCount(1);
  await expect(page.getByText(/R\$\s*130,00/).first()).toBeVisible();

  // De volta ao Roteiro: a atividade aparece como lançada e não oferece lançar de novo.
  await page.getByRole("link", { name: "Roteiro" }).click();
  const volta = page.getByRole("region", { name: "Dia 1" }).locator("div.rounded-xl", { has: page.locator("input[value='Jantar no Time Out Market']") });
  await expect(volta.locator("[data-lancado-financas]")).toContainText("Lançado nas Finanças");
  await expect(volta.getByRole("button", { name: "Lançar nas Finanças" })).toHaveCount(0);
});

test("lançar o dia inteiro: um gasto por atividade com custo, só o que ainda não foi lançado", async ({ page }) => {
  await abrirComRoteiro(page);
  const dia2 = page.getByRole("region", { name: "Dia 2" });
  await dia2.getByRole("button", { name: "Lançar o dia nas Finanças" }).click();
  const dialogo = page.getByRole("dialog", { name: "Lançar nas Finanças" });
  // A praia (R$ 0) não entra; táxi e museu somam R$ 75,50.
  await expect(dialogo).toContainText("2 atividades");
  await expect(dialogo).toContainText("Táxi de volta");
  await expect(dialogo).toContainText("Museu do Mar");
  await expect(dialogo).not.toContainText("Praia de Carcavelos");
  await expect(dialogo).toContainText(/Total:\s*R\$\s*75,50/);
  await dialogo.getByRole("radio", { name: /Só meu/ }).check();
  await dialogo.getByRole("button", { name: "Confirmar lançamento" }).click();
  await expect(dialogo.locator("[data-lancamento-feito]")).toContainText("2 gastos lançados");
  await dialogo.locator("[data-lancamento-feito]").getByRole("button", { name: "Fechar" }).click();

  // O dia já não oferece o botão, e cada atividade mostra o selo.
  await expect(dia2.getByRole("button", { name: "Lançar o dia nas Finanças" })).toHaveCount(0);
  await expect(dia2.locator("[data-lancado-financas]")).toHaveCount(2);
  await expect(dia2.getByRole("button", { name: "Lançar nas Finanças" })).toHaveCount(0);

  await page.getByRole("link", { name: "DuoFinance" }).click();
  await expect(page.getByText("Táxi de volta (Roteiro · Cascais)", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Museu do Mar (Roteiro · Cascais)", { exact: true })).toHaveCount(1);
});
