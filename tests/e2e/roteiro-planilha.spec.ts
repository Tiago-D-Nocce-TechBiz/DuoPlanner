import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { abrirPainel } from "./apoio";

/**
 * Roteiro com planilha: baixar o modelo, importar (.csv e .xlsx), prévia
 * dia a dia, salvar, reimportar sem duplicar, filtros por categoria e
 * "Desfazer". As Server Actions falham como sem rede (`abrirPainel`), então a
 * curadoria da Nora cai no fallback local: a planilha é organizada no
 * aparelho, sem sugestões. A curadoria com IA é coberta no Vitest.
 */

const CSV = [
  "Destino;Data;Turno_ou_Horario;Atividade_ou_Lugar;Categoria;Custo_Estimado;Observacoes",
  "Lisboa;2026-09-10;Manhã;Bondinho 28;Passeio;25;",
  "Lisboa;10/09/2026;20:00;Jantar no Time Out Market;Gastronomia;120;Reservar mesa",
  "Cascais;2026-09-11;Tarde;Praia de Carcavelos;Praia;0;",
  "Cascais;2026-09-11;Noite;Táxi de volta;Transporte;45,50;",
].join("\n");

const arquivoCsv = (nome = "viagem.csv") => ({ name: nome, mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });

async function abrirRoteiro(page: Page) {
  await abrirPainel(page, "/dashboard/roteiro");
  await expect(page.getByRole("heading", { name: "Roteiro", exact: true })).toBeVisible();
}

async function abrirDialogo(page: Page) {
  await page.getByRole("button", { name: "Importar Planilha com a Nora" }).click();
  const dialogo = page.getByRole("dialog", { name: "Importar planilha com a Nora" });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

async function importar(page: Page, arquivo = arquivoCsv()) {
  const dialogo = await abrirDialogo(page);
  await dialogo.getByLabel("Arquivo da planilha (.xlsx ou .csv)").setInputFiles(arquivo);
  await expect(dialogo.locator("[data-dia-previa]").first()).toBeVisible({ timeout: 15_000 });
  return dialogo;
}

test("baixa o modelo oficial: DuoPlanner-Modelo-Roteiro.xlsx, um .xlsx de verdade", async ({ page }) => {
  await abrirRoteiro(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar Planilha Modelo" }).click()]);
  expect(download.suggestedFilename()).toBe("DuoPlanner-Modelo-Roteiro.xlsx");
  const caminho = await download.path();
  const bytes = await readFile(caminho);
  expect(bytes.length).toBeGreaterThan(1000);
  expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304"); // zip: PK\x03\x04
});

test("o modelo baixado é aceito pela própria importação (3 atividades, sem nenhum ajuste)", async ({ page }) => {
  await abrirRoteiro(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar Planilha Modelo" }).click()]);
  const bytes = await readFile(await download.path());
  const dialogo = await importar(page, {
    name: "DuoPlanner-Modelo-Roteiro.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await expect(dialogo.locator("[data-resumo-importacao]")).toContainText("3 atividades novas em 2 dias");
  await expect(dialogo.getByText(/ajustes? feitos?/)).toHaveCount(0);
});

test("importa o CSV: prévia dia a dia, tudo marcado, aviso de fallback local, e salva no Roteiro agrupado por dia", async ({ page }) => {
  await abrirRoteiro(page);
  const dialogo = await importar(page);

  // Toggle da Nora ligado por padrão; a Server Action está sem rede: segue sem sugestões, com aviso.
  await expect(dialogo.locator("[data-resumo-importacao]")).toContainText("4 atividades novas em 2 dias");
  await expect(dialogo.getByRole("status").filter({ hasText: "Sem conexão com a Nora" })).toBeVisible();
  const dias = dialogo.locator("[data-dia-previa]");
  await expect(dias).toHaveCount(2);
  await expect(dias.nth(0)).toContainText("Lisboa");
  await expect(dias.nth(1)).toContainText("Cascais");
  for (const nome of ["Bondinho 28", "Jantar no Time Out Market", "Praia de Carcavelos", "Táxi de volta"]) {
    await expect(dialogo.getByRole("checkbox", { name: nome })).toBeChecked();
  }
  // Ordem por turno e horário dentro do dia.
  await expect(dias.nth(0).locator("li").first()).toContainText("Bondinho 28");

  await dialogo.getByRole("button", { name: "Salvar 4 atividades no Roteiro" }).click();
  await expect(dialogo.locator("[data-importacao-salva]")).toContainText("4 atividades salvas");
  await dialogo.getByRole("button", { name: "Concluir" }).click();
  await expect(dialogo).toBeHidden();

  // Roteiro agrupado por dia da viagem: data, destino e custo estimado do dia.
  const secoes = page.getByRole("region", { name: /^Dia \d$/ });
  await expect(secoes).toHaveCount(2);
  await expect(secoes.nth(0).getByLabel("Destino do dia 1")).toHaveValue("Lisboa");
  await expect(secoes.nth(0).getByLabel("Data do dia 1")).toHaveValue("2026-09-10");
  await expect(secoes.nth(0).locator("[data-custo-do-dia]")).toContainText(/R\$\s*145,00/);
  await expect(secoes.nth(1).getByLabel("Destino do dia 2")).toHaveValue("Cascais");
  await expect(secoes.nth(1).locator("[data-custo-do-dia]")).toContainText(/R\$\s*45,50/);
  await expect(secoes.nth(0).getByLabel("Atividade", { exact: true })).toHaveCount(2);
  await expect(secoes.nth(0).getByLabel("Atividade", { exact: true }).first()).toHaveValue("Bondinho 28");
  await expect(secoes.nth(0).locator("[data-origem-atividade='planilha']")).toHaveCount(2);
});

test("reimportar a mesma planilha não duplica nada: tudo já está no roteiro", async ({ page }) => {
  await abrirRoteiro(page);
  let dialogo = await importar(page);
  await dialogo.getByRole("button", { name: "Salvar 4 atividades no Roteiro" }).click();
  await dialogo.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveCount(4);

  dialogo = await importar(page);
  await expect(dialogo.locator("[data-resumo-importacao]")).toContainText("0 atividades novas");
  await expect(dialogo.locator("[data-resumo-importacao]")).toContainText("4 já no roteiro");
  await expect(dialogo.getByText("Já está no roteiro")).toHaveCount(4);
  await expect(dialogo.getByRole("checkbox", { name: "Bondinho 28" })).toBeDisabled();
  await expect(dialogo.getByRole("button", { name: "Nada selecionado" })).toBeDisabled();
  await dialogo.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("region", { name: /^Dia \d$/ })).toHaveCount(2);
});

test("desmarcar uma atividade na prévia a deixa de fora; com o toggle desligado não há aviso da Nora", async ({ page }) => {
  await abrirRoteiro(page);
  const dialogo = await abrirDialogo(page);
  await dialogo.getByRole("checkbox", { name: /Pedir para a Nora sugerir/ }).uncheck();
  await dialogo.getByLabel("Arquivo da planilha (.xlsx ou .csv)").setInputFiles(arquivoCsv());
  await expect(dialogo.locator("[data-dia-previa]").first()).toBeVisible({ timeout: 15_000 });
  await expect(dialogo.getByText("Sem conexão com a Nora")).toHaveCount(0);

  await dialogo.getByRole("checkbox", { name: "Táxi de volta" }).uncheck();
  await dialogo.getByRole("button", { name: "Salvar 3 atividades no Roteiro" }).click();
  await dialogo.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveCount(3);
  await expect(page.locator("input[value='Táxi de volta']")).toHaveCount(0);
});

test("filtros rápidos por categoria e remoção com Desfazer por 5 s", async ({ page }) => {
  await abrirRoteiro(page);
  const dialogo = await importar(page);
  await dialogo.getByRole("button", { name: "Salvar 4 atividades no Roteiro" }).click();
  await dialogo.getByRole("button", { name: "Concluir" }).click();

  const filtros = page.getByRole("group", { name: "Filtrar atividades por categoria" });
  await expect(filtros.getByRole("button")).toHaveText(["Todos", "Praia", "Passeio", "Gastronomia", "Transporte"]);
  await expect(filtros.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");

  await filtros.getByRole("button", { name: "Praia" }).click();
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveValue("Praia de Carcavelos");
  await expect(page.getByRole("region", { name: /^Dia \d$/ })).toHaveCount(1);

  await filtros.getByRole("button", { name: "Transporte" }).click();
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveValue("Táxi de volta");
  await filtros.getByRole("button", { name: "Todos" }).click();
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveCount(4);

  // Remover e desfazer: a atividade volta no mesmo lugar e a soma do dia também.
  const bondinho = page.locator("input[value='Bondinho 28']");
  await page.getByRole("region", { name: "Dia 1" }).getByRole("button", { name: "Remover atividade" }).first().click();
  await expect(bondinho).toHaveCount(0);
  await expect(page.locator("[data-toast-desfazer]")).toBeVisible();
  await expect(page.getByRole("region", { name: "Dia 1" }).locator("[data-custo-do-dia]")).toContainText(/R\$\s*120,00/);
  await page.locator("[data-toast-desfazer]").getByRole("button", { name: "Desfazer" }).click();
  await expect(bondinho).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Dia 1" }).locator("[data-custo-do-dia]")).toContainText(/R\$\s*145,00/);
});

test("arquivo inválido mostra o motivo e deixa tentar de novo; Esc fecha o diálogo", async ({ page }) => {
  await abrirRoteiro(page);
  const dialogo = await abrirDialogo(page);
  const entrada = dialogo.getByLabel("Arquivo da planilha (.xlsx ou .csv)");

  await entrada.setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await expect(dialogo.getByRole("alert")).toContainText("Use um arquivo .xlsx ou .csv");

  await entrada.setInputFiles({ name: "vazia.csv", mimeType: "text/csv", buffer: Buffer.from("Destino;Data\nLisboa;2026-09-10\n") });
  await expect(dialogo.getByRole("alert")).toContainText("cabeçalho");

  await entrada.setInputFiles(arquivoCsv());
  await expect(dialogo.locator("[data-dia-previa]").first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();
});

/* ---------------------- sugestões da Nora (curadoria com IA simulada) ---------------------- */

const SUGESTOES = [
  { destino: "Lisboa", titulo: "Praia do Guincho", categoria: "Praia", porque: "Vento e ondas fortes, ótima para um fim de tarde a dois.", turno: "tarde", diaNumero: 1, custoEstimadoBrl: 0 },
  { destino: "Lisboa", titulo: "Cervejaria Ramiro", categoria: "Gastronomia", porque: "Marisco fresco, clássico da cidade.", turno: "noite", diaNumero: null, custoEstimadoBrl: 180 },
  { destino: "Cascais", titulo: "Boca do Inferno", categoria: "Passeio", porque: "Penhasco com vista para o mar, perto do centro.", turno: "manha", diaNumero: 2, custoEstimadoBrl: null },
];

/**
 * Responde à Server Action da curadoria como se o Gemini tivesse funcionado
 * (mesmo formato de fio da resposta real do Next). As demais ações seguem sem
 * rede, como no `abrirPainel`.
 */
async function simularCuradoriaComIa(page: Page) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) return route.fallback();
    if (!(req.postData() ?? "").includes("incluirSugestoes")) return route.fallback();
    const resultado = { success: true, data: { origem: "ia", aviso: null, classificacoes: [], sugestoes: SUGESTOES } };
    return route.fulfill({
      status: 200,
      contentType: "text/x-component",
      body: `0:{"a":"$@1","q":"","i":true,"b":"development"}\n1:${JSON.stringify(resultado)}\n`,
    });
  });
}

test("sugestões da Nora: cards com o porquê, 'Incluir no Roteiro' ou 'Ignorar'; só o incluído é gravado, com origem da Nora", async ({ page }) => {
  await abrirRoteiro(page);
  await simularCuradoriaComIa(page);
  const dialogo = await importar(page);

  const cards = dialogo.locator("[data-sugestao-nora]");
  await expect(cards).toHaveCount(3);
  await expect(dialogo.locator("[data-resumo-importacao]")).toContainText("3 sugestões da Nora");
  await expect(dialogo.getByText("Sem conexão com a Nora")).toHaveCount(0);
  // Cada sugestão cai num dia do destino dela, com a explicação.
  await expect(dialogo.locator("[data-dia-previa]").nth(0).locator("[data-sugestao-nora]")).toHaveCount(2);
  await expect(dialogo.locator("[data-dia-previa]").nth(1).locator("[data-sugestao-nora]")).toHaveCount(1);
  await expect(cards.filter({ hasText: "Praia do Guincho" })).toContainText("Vento e ondas fortes");
  await expect(cards.filter({ hasText: "Cervejaria Ramiro" })).toContainText(/R\$\s*180,00/);

  // Sugestões não vêm marcadas: o botão de salvar só conta as 4 da planilha.
  await expect(dialogo.getByRole("button", { name: "Salvar 4 atividades no Roteiro" })).toBeVisible();
  await cards.filter({ hasText: "Praia do Guincho" }).getByRole("button", { name: "Incluir no Roteiro" }).click();
  await expect(cards.filter({ hasText: "Praia do Guincho" }).getByRole("button", { name: "Incluída" })).toHaveAttribute("aria-pressed", "true");
  await cards.filter({ hasText: "Cervejaria Ramiro" }).getByRole("button", { name: "Ignorar" }).click();
  await expect(cards).toHaveCount(2);
  await expect(dialogo.getByRole("button", { name: "Salvar 5 atividades no Roteiro" })).toBeVisible();

  await dialogo.getByRole("button", { name: "Salvar 5 atividades no Roteiro" }).click();
  await dialogo.getByRole("button", { name: "Concluir" }).click();

  // No Roteiro: a sugestão incluída aparece com o selo; as outras não entraram.
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveCount(5);
  await expect(page.locator("input[value='Praia do Guincho']")).toHaveCount(1);
  await expect(page.locator("input[value='Cervejaria Ramiro']")).toHaveCount(0);
  await expect(page.locator("input[value='Boca do Inferno']")).toHaveCount(0);
  await expect(page.locator("[data-origem-atividade='nora_sugestao']")).toHaveCount(1);
  await expect(page.locator("[data-origem-atividade='nora_sugestao']")).toContainText("Sugestão da Nora");
  const filtros = page.getByRole("group", { name: "Filtrar atividades por categoria" });
  await filtros.getByRole("button", { name: "Praia" }).click();
  await expect(page.getByLabel("Atividade", { exact: true })).toHaveCount(2);

  // Reimportar: a sugestão aceita não volta como pendente (e não duplica); as outras sim.
  await filtros.getByRole("button", { name: "Todos" }).click();
  const novo = await importar(page);
  await expect(novo.locator("[data-sugestao-nora]")).toHaveCount(2);
  await expect(novo.locator("[data-sugestao-nora]", { hasText: "Praia do Guincho" })).toHaveCount(0);
  await expect(novo.getByRole("button", { name: "Nada selecionado" })).toBeDisabled();
});
