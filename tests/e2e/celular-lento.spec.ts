import { expect, test, type Page } from "@playwright/test";
import { abrirPainel, copiaDoMotor } from "./apoio";
import { anotar, esperarLinhas, esperarTexto, frearCelular, medir, observarInteracoes, piorInteracao, rolarAteOFim, tocar, type Medida } from "./medicao";

/**
 * Celular lento no app completo (`next dev`): CPU 4x mais lenta e rede
 * "Slow 4G" do Lighthouse pelo CDP do Edge, numa tela de 390 × 844.
 *
 * A página carrega antes do freio (no `next dev` os pacotes têm vários MB e
 * medir o download deles não diz nada sobre produção); o freio entra para
 * as interações, que é o que o local-first promete: com rede ruim ou sem
 * rede, tocar e ver o resultado não espera o servidor. Por isso o teste
 * também confere que nenhuma interação abaixo dispara requisição.
 *
 * Este é o React de DESENVOLVIMENTO, várias vezes mais lento que o de
 * produção: o teto aqui (500 ms de mediana) só pega regressão grosseira. O
 * teto de verdade (INP bom, 200 ms) é medido com o React de produção sob a
 * mesma CPU em `painel-producao.spec.ts` e `importador-producao.spec.ts`.
 */

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, trace: "off" });

const TETO_DEV_MS = 500;

/** Requisições feitas pela página a partir de agora (menos as do próprio Next em dev: HMR, chunks). */
function vigiarRede(page: Page) {
  const feitas: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/__nextjs")) return;
    feitas.push(`${r.method()} ${url.pathname}`);
  });
  return feitas;
}

function conferir(medidas: Record<string, Medida>, requisicoes: string[]) {
  anotar(medidas, "interações no next dev (ms): mediana / pior");
  expect(requisicoes, "interação local-first não pode esperar a rede").toEqual([]);
  for (const [nome, m] of Object.entries(medidas)) expect(m.mediana, `${nome}: ${m.todas.join(", ")}`).toBeLessThan(TETO_DEV_MS);
}

test("DuoFinance com 230 gastos: paginação, abas, busca e categoria sem esperar a rede", async ({ page }) => {
  await abrirPainel(page, "/dashboard/financas", { armazenamento: copiaDoMotor({ gastos: 230 }) });
  const linhas = page.locator("ul:visible > li").filter({ has: page.getByRole("button", { name: /^Remover / }) });
  await expect(linhas).toHaveCount(50);
  // 198 gastos da viagem: 50 na tela, o resto sob demanda.
  await expect(page.getByRole("button", { name: /^Carregar mais/ })).toHaveText("Carregar mais 50 (148 restantes)");
  await frearCelular(page);
  const requisicoes = vigiarRede(page);
  await observarInteracoes(page);
  const medidas: Record<string, Medida> = {};

  medidas["carregar mais"] = await medir(page, 2, async (i) => {
    await tocar(page.getByRole("button", { name: /^Carregar mais/ }));
    await esperarLinhas(page, Math.min(198, 50 * (i + 3)));
  });

  medidas["trocar de aba"] = await medir(page, 2, async (i) => {
    const pessoais = i % 2 !== 0;
    await tocar(page.getByRole("tab", { name: pessoais ? /Pessoais/ : /Da viagem/ }));
    // Cada aba guarda a própria página: a da viagem volta com as 198 linhas já abertas.
    await esperarLinhas(page, pessoais ? 32 : 198);
  });
  await tocar(page.getByRole("tab", { name: /Da viagem/ }));
  await esperarLinhas(page, 198);
  await piorInteracao(page);

  const busca = page.getByRole("searchbox", { name: "Buscar gastos" });
  await busca.focus();
  await piorInteracao(page);
  medidas["tecla na busca"] = await medir(page, 4, (i) => page.keyboard.press(["m", "u", "s", "e", "u"][i + 1]));
  await esperarTexto(page, "25 gastos encontrados");
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await esperarLinhas(page, 50); // busca nova volta para a 1ª página
  await piorInteracao(page);

  medidas["trocar categoria"] = await medir(page, 2, async (i) => {
    const alvo = linhas.nth(i + 1).getByRole("combobox");
    const antes = await alvo.inputValue();
    await alvo.focus();
    await piorInteracao(page);
    await page.keyboard.press(antes === "Hospedagem" ? "ArrowUp" : "ArrowDown");
    await expect(alvo).not.toHaveValue(antes);
  });

  conferir(medidas, requisicoes);
});

test("modo offline: o selo avisa e o checklist grava e marca na hora", async ({ page, context }) => {
  await abrirPainel(page, "/dashboard/checklist");
  await expect(page.getByRole("heading", { name: "Checklist de Viagem" })).toBeVisible();
  await frearCelular(page);
  await context.setOffline(true);
  const selo = page.locator("[data-sync-badge]");
  await expect(selo).toHaveAttribute("data-estado", "offline");
  await expect(selo.getByText("Offline", { exact: true })).toBeVisible();

  const requisicoes = vigiarRede(page);
  await observarInteracoes(page);
  const medidas: Record<string, Medida> = {};
  const campo = page.getByLabel("Novo item");
  medidas["adicionar"] = await medir(page, 2, async (i) => {
    await campo.fill(`Levar item ${i + 2}`);
    await piorInteracao(page); // a digitação não conta
    await tocar(page.getByRole("button", { name: "+ Adicionar" }));
    await esperarTexto(page, `Levar item ${i + 2}`);
  });
  medidas["marcar"] = await medir(page, 2, async (i) => {
    const item = page.getByRole("checkbox", { name: `Levar item ${i + 2}` });
    await tocar(item);
    await expect(item).toBeChecked();
  });
  await context.setOffline(false);
  conferir(medidas, requisicoes);
});

test("rolagem de 100 gastos no app completo: no ritmo da tela, sem tarefa longa", async ({ page }) => {
  await abrirPainel(page, "/dashboard/financas", { armazenamento: copiaDoMotor({ gastos: 230 }) });
  await tocar(page.getByRole("button", { name: /^Carregar mais 50/ }));
  await esperarLinhas(page, 100);
  await frearCelular(page);
  const r = await rolarAteOFim(page);
  test.info().annotations.push({ type: "rolagem, CPU 4x", description: `${r.quadros} quadros · p95 ${r.p95.toFixed(1)} ms · ${r.longas} tarefas longas · ${r.alvo}px` });
  expect(r.alvo).toBeGreaterThan(5000);
  expect(r.p95).toBeLessThan(34);
  expect(r.longas).toBeLessThanOrEqual(1);
});
