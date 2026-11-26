import { expect, test, type Page } from "@playwright/test";
import { idDoAcerto, txidDoAcerto } from "../../src/lib/finance/acerto-registro";
import { lerBrCode } from "../../src/lib/pix/ler-brcode";
import { abrirPainel, CONTEXTO, copiaDoMotorComDespesas, EU, ESPACO, gastoCompartilhado, PAR } from "./apoio";

/**
 * Acerto de Contas do DuoPlanner na tela: saldo pela regra do casal, Pix
 * Copia e Cola decodificado de volta e o registro do pagamento (com o id que
 * deduplica "Já paguei" e "Recebi").
 *
 * Ana (EU, dona) é quem usa o painel; Beto (PAR) é o parceiro.
 */

const PIX_DA_ANA = { tipo: "email" as const, chave: "ana@exemplo.com", nomeRecebedor: "Ana Souza", cidade: "Sao Paulo" };

function contexto(opcoes: { pixDaAna?: boolean; acordo?: Partial<typeof CONTEXTO.acordo> } = {}): typeof CONTEXTO {
  return {
    ...CONTEXTO,
    membros: CONTEXTO.membros.map((m) => (m.userId === EU ? { ...m, pix: opcoes.pixDaAna === false ? null : PIX_DA_ANA } : m)),
    acordo: { ...CONTEXTO.acordo, ...opcoes.acordo },
  };
}

/** Ana pagou R$ 100,00 e Beto R$ 20,00: no 50/50, Beto deve R$ 40,00. */
const ANA_100_BETO_20 = [gastoCompartilhado(1, EU, 100), gastoCompartilhado(2, PAR, 20)];

async function abrirAcerto(page: Page, despesas: unknown[], ctx = contexto()) {
  await abrirPainel(page, "/dashboard/acerto", { armazenamento: copiaDoMotorComDespesas(despesas), contexto: ctx });
  await expect(page.getByRole("heading", { name: "Acerto de Contas" })).toBeVisible();
}

test("saldo pela regra 50/50: Beto deve R$ 40,00 à Ana, com o que cada um pagou e a parte de cada um", async ({ page }) => {
  await abrirAcerto(page, ANA_100_BETO_20);
  await expect(page.getByText(/Beto paga R\$\s40,00 para você/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Receber R\$\s40,00 de Beto/ })).toBeVisible();
  await expect(page.getByText(/Total da viagem R\$\s120,00/)).toBeVisible();
  await expect(page.getByText("Divisão igual (50/50)")).toBeVisible();
  // Cada um: pagou e parte.
  await expect(page.getByText("Ana", { exact: true }).locator("xpath=..")).toContainText(/Pagou\s+R\$\s100,00/);
  await expect(page.getByText("Ana", { exact: true }).locator("xpath=..")).toContainText(/Parte\s+R\$\s60,00/);
  await expect(page.getByText("Beto", { exact: true }).first().locator("xpath=..")).toContainText(/Pagou\s+R\$\s20,00/);
});

test("Pix Copia e Cola: decodificado de volta, tem a chave da Ana, R$ 40,00, nome, cidade e o txid do acerto", async ({ page }) => {
  await abrirAcerto(page, ANA_100_BETO_20);
  const payload = await page.locator("#pix-copia-cola").inputValue();
  const lido = lerBrCode(payload);
  if (!lido.ok) throw new Error(`BR Code inválido: ${lido.erro}`);
  expect(lido.dados).toMatchObject({ chave: "ana@exemplo.com", nomeRecebedor: "Ana Souza", cidade: "Sao Paulo", valorCentavos: 4_000 });
  const identidade = { workspaceId: ESPACO, devedorId: PAR, credorId: EU, valorCentavos: 4_000, acertosJaRegistrados: 0 };
  expect(lido.dados.txid).toBe(txidDoAcerto(identidade));
  expect(lido.dados.descricao).toBe("Acerto da viagem DuoPlanner");

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.getByRole("button", { name: "Copiar Pix Copia e Cola" }).click();
  await expect(page.getByRole("button", { name: /Copiado/ })).toBeVisible();
});

test("sem chave Pix cadastrada: avisa e leva a Configurações, sem inventar um código", async ({ page }) => {
  await abrirAcerto(page, ANA_100_BETO_20, contexto({ pixDaAna: false }));
  await expect(page.getByText("Cadastre sua chave Pix em Configurações")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cadastrar chave Pix" })).toBeVisible();
  await expect(page.locator("#pix-copia-cola")).toHaveCount(0);
});

test("registrar o acerto zera o saldo e grava o lançamento com o id determinístico do acerto", async ({ page }) => {
  await abrirAcerto(page, ANA_100_BETO_20);
  await page.getByRole("button", { name: "Recebi: registrar o acerto" }).click();
  // O saldo zera na hora: a seção do Pix some e a tela mostra o saldo equilibrado.
  await expect(page.getByText("Contas equilibradas! Ninguém deve nada.")).toBeVisible();
  await expect(page.locator("#pix-copia-cola")).toHaveCount(0);

  // O id gravado na fila é o que "Já paguei" (no aparelho do Beto) também geraria.
  const esperado = idDoAcerto({ workspaceId: ESPACO, devedorId: PAR, credorId: EU, valorCentavos: 4_000, acertosJaRegistrados: 0 });
  await expect
    .poll(async () => {
      const bruto = await page.evaluate((chave) => localStorage.getItem(chave), `pd-sync:${EU}`);
      const copia = bruto ? (JSON.parse(bruto) as { fila?: { recurso: string; tipo: string; registro?: { id: string; tipo: string; pagoPor: string; valor: number } }[] }) : null;
      return (copia?.fila ?? []).filter((op) => op.recurso === "despesas" && op.tipo === "criar" && op.registro?.tipo === "acerto").map((op) => [op.registro?.id, op.registro?.pagoPor, op.registro?.valor]);
    }, { timeout: 10_000 })
    .toEqual([[esperado, PAR, 40]]);
});

test("o acerto de quem deve é o mesmo: Beto vê 'Pagar' e o registro tem o mesmo id da Ana", async ({ browser }) => {
  // Sessão do Beto: o painel mostra "Pagar R$ 40,00 para Ana" e "Já paguei".
  const ctxBeto = { ...contexto(), userId: PAR, membros: contexto().membros };
  const copiaDoBeto = { [`pd-sync:${PAR}`]: JSON.stringify({ v: 1, workspaceId: ESPACO, servidor: { despesas: ANA_100_BETO_20 }, fila: [], ultimaSincronizacao: null }) };
  const contexto2 = await browser.newContext();
  const page = await contexto2.newPage();
  await abrirPainel(page, "/dashboard/acerto", { armazenamento: copiaDoBeto, contexto: ctxBeto });
  await expect(page.getByRole("heading", { name: /Pagar R\$\s40,00 para Ana/ })).toBeVisible();
  await page.getByRole("button", { name: "Já paguei: registrar o acerto" }).click();
  await expect(page.getByText("Contas equilibradas! Ninguém deve nada.")).toBeVisible();
  const esperado = idDoAcerto({ workspaceId: ESPACO, devedorId: PAR, credorId: EU, valorCentavos: 4_000, acertosJaRegistrados: 0 });
  await expect
    .poll(async () => {
      const bruto = await page.evaluate((chave) => localStorage.getItem(chave), `pd-sync:${PAR}`);
      const copia = bruto ? (JSON.parse(bruto) as { fila?: { recurso: string; registro?: { id: string; tipo: string } }[] }) : null;
      return (copia?.fila ?? []).filter((op) => op.recurso === "despesas" && op.registro?.tipo === "acerto").map((op) => op.registro?.id);
    }, { timeout: 10_000 })
    .toEqual([esperado]);
  await contexto2.close();
});

test("regra proporcional 60/40 com centavo ímpar: as partes somam o total e o saldo fecha ao centavo", async ({ page }) => {
  // Ana pagou R$ 100,01: 60% = 60,006 → 60,01 para ela; 40% = 40,00 para o Beto.
  await abrirAcerto(page, [gastoCompartilhado(1, EU, 100.01)], contexto({ acordo: { regra: "proporcional", percentualDono: 60 } }));
  await expect(page.getByText("Ana 60% · Beto 40%")).toBeVisible();
  await expect(page.getByText(/Beto paga R\$\s40,00 para você/)).toBeVisible();
  await expect(page.getByText("Ana", { exact: true }).locator("xpath=..")).toContainText(/Parte\s+R\$\s60,01/);
  await expect(page.getByText("Beto", { exact: true }).first().locator("xpath=..")).toContainText(/Parte\s+R\$\s40,00/);
});

test("sem gastos compartilhados: orienta a lançar no DuoFinance", async ({ page }) => {
  await abrirAcerto(page, []);
  await expect(page.getByText("Nenhum gasto da viagem ainda.")).toBeVisible();
  await expect(page.getByRole("link", { name: "DuoFinance" }).first()).toBeVisible();
});
