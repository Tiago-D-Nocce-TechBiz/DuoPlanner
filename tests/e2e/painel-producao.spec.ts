import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { CONTEXTO, copiaDoMotor } from "./apoio";
import {
  alturasDasLinhas,
  anotar,
  esperarLinhas,
  esperarTexto,
  frearCpu,
  INP_BOM_MS,
  medir,
  observarInteracoes,
  piorInteracao,
  rolarAteOFim,
  tocar,
  type Medida,
} from "./medicao";
import { montarCss, montarPacote, paginaDoPacote } from "./producao/montar";

/**
 * Painel no celular lento com o React de PRODUÇÃO: CPU 4x mais lenta (CDP),
 * tela de 390 × 844, o motor de sincronização real em modo local e o CSS
 * de verdade (Tailwind compilado do `globals.css` e otimizado como no build,
 * para o layout e o `content-visibility` contarem).
 *
 * O `next dev` serve para o fluxo (`celular-lento.spec.ts`), não para
 * cronometrar: o React de desenvolvimento é várias vezes mais lento. Aqui o
 * teto é o do INP "bom" do Google: 200 ms por interação (mediana depois de
 * uma rodada de aquecimento; a 1ª vez aparece no "pior").
 *
 * Só o cliente Supabase é trocado (por "ausente"); o resto é o código do app.
 */

const ORIGEM = "http://localhost:39998";

let servir: ReturnType<typeof paginaDoPacote>;

test.beforeAll(async ({}, info) => {
  const raiz = path.dirname(info.config.configFile!);
  const [js, css] = await Promise.all([
    montarPacote(raiz, "tests/e2e/producao/painel.tsx", {
      "@/lib/supabase/client-sob-demanda": "tests/e2e/producao/supabase-ausente.ts",
    }),
    montarCss(raiz),
  ]);
  servir = paginaDoPacote({ js, css });
});

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, trace: "off" });

async function abrir(page: Page, tela: "financas" | "checklist" | "roteiro", armazenamento: Record<string, string> = {}) {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.addInitScript(
    ({ contexto, armazenamento }) => {
      (window as unknown as { __contexto: unknown }).__contexto = contexto;
      if (!sessionStorage.getItem("semeado")) {
        localStorage.clear();
        for (const [k, v] of Object.entries(armazenamento)) localStorage.setItem(k, v);
        sessionStorage.setItem("semeado", "1");
      }
    },
    { contexto: CONTEXTO, armazenamento }
  );
  await page.route(`${ORIGEM}/**`, (route) => route.fulfill(servir(route.request().url())));
  await page.goto(`${ORIGEM}/?tela=${tela}`);
  return erros;
}

const linhasVisiveis = (page: Page) => page.locator("ul:visible > li");

function conferir(medidas: Record<string, Medida>, erros: string[]) {
  anotar(medidas);
  expect(erros).toEqual([]);
  for (const [nome, m] of Object.entries(medidas)) expect(m.mediana, `${nome}: ${m.todas.join(", ")}`).toBeLessThan(INP_BOM_MS);
}

test("DuoFinance com 230 gastos: abas, carregar mais, busca, categoria e remoção abaixo de 200 ms", async ({ page }) => {
  const erros = await abrir(page, "financas", copiaDoMotor({ gastos: 230 }));
  await expect(linhasVisiveis(page)).toHaveCount(50);
  const abaViagem = page.getByRole("tab", { name: "Da viagem (198)" });
  const abaPessoais = page.getByRole("tab", { name: "Pessoais (32)" });
  await frearCpu(page);
  await observarInteracoes(page);
  const medidas: Record<string, Medida> = {};

  medidas["trocar de aba"] = await medir(page, 4, async (i) => {
    const pessoais = i % 2 !== 0; // aquecimento (-1) e 1: Pessoais; 0 e 2: Da viagem
    await tocar(pessoais ? abaPessoais : abaViagem);
    await esperarLinhas(page, pessoais ? 32 : 50);
  });
  await tocar(abaViagem);
  await esperarLinhas(page, 50);
  await piorInteracao(page);

  medidas["carregar mais"] = await medir(page, 2, async (i) => {
    await tocar(page.getByRole("button", { name: /^Carregar mais/ }));
    await esperarLinhas(page, Math.min(198, 50 * (i + 3)));
  });

  await page.getByRole("searchbox", { name: "Buscar gastos" }).focus();
  await piorInteracao(page);
  medidas["tecla na busca"] = await medir(page, 4, (i) => page.keyboard.press(["m", "u", "s", "e", "u"][i + 1]));
  // O filtro roda na pausa da digitação, numa transição: não pertence a nenhuma tecla.
  await esperarTexto(page, "25 gastos encontrados");
  await piorInteracao(page);

  // Apagar tudo: a lista inteira volta (sem esperar a pausa), também em transição.
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await esperarLinhas(page, 50);
  await piorInteracao(page);
  medidas["apagar a busca"] = await medir(page, 2, async () => {
    await page.keyboard.type("museu");
    await esperarTexto(page, "25 gastos encontrados");
    await piorInteracao(page); // a digitação foi medida acima
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await esperarLinhas(page, 50);
  });

  const selects = page.locator("ul:visible > li select");
  medidas["trocar categoria"] = await medir(page, 4, async (i) => {
    const alvo = selects.nth(i + 1);
    const antes = await alvo.inputValue();
    await alvo.focus();
    await piorInteracao(page);
    await page.keyboard.press(antes === "Hospedagem" ? "ArrowUp" : "ArrowDown");
    await expect(alvo).not.toHaveValue(antes);
  });

  medidas["remover (com Desfazer)"] = await medir(page, 2, async () => {
    const remover = linhasVisiveis(page).first().getByRole("button", { name: /^Remover / });
    const nome = (await remover.getAttribute("aria-label"))!;
    await tocar(remover);
    await page.waitForFunction((n) => !document.querySelector(`[aria-label="${n}"]`), nome, { polling: 50 });
  });

  conferir(medidas, erros);
});

test("checklist: adicionar e marcar abaixo de 200 ms", async ({ page }) => {
  const erros = await abrir(page, "checklist");
  await expect(page.getByRole("heading", { name: "Checklist de Viagem" })).toBeVisible();
  const campo = page.getByLabel("Novo item");
  await frearCpu(page);
  await observarInteracoes(page);
  const medidas: Record<string, Medida> = {};

  medidas["adicionar"] = await medir(page, 4, async (i) => {
    await campo.fill(`Item ${i + 1}`);
    await piorInteracao(page); // a digitação não conta
    await tocar(page.getByRole("button", { name: "+ Adicionar" }));
    await esperarTexto(page, `Item ${i + 1}`);
  });
  medidas["marcar"] = await medir(page, 4, async (i) => {
    const item = page.getByRole("checkbox", { name: `Item ${i + 1}` });
    await tocar(item);
    await expect(item).toBeChecked();
  });

  conferir(medidas, erros);
});

test("roteiro com 20 dias e 120 atividades: cada tecla no título abaixo de 200 ms", async ({ page }) => {
  const erros = await abrir(page, "roteiro", copiaDoMotor({ roteiro: { dias: 20, porDia: 6 } }));
  const titulo = page.getByRole("textbox", { name: "Atividade" }).first();
  await expect(titulo).toHaveValue("Atividade 1 do dia 1");
  await frearCpu(page);
  await titulo.focus();
  await page.keyboard.press("End");
  await observarInteracoes(page);
  const medidas: Record<string, Medida> = {};

  medidas["tecla no título"] = await medir(page, 6, (i) => page.keyboard.press(" noite!"[i + 1]));
  await expect(titulo).toHaveValue("Atividade 1 do dia 1 noite!");
  medidas["apagar"] = await medir(page, 4, () => page.keyboard.press("Backspace"));
  await expect(titulo).toHaveValue("Atividade 1 do dia 1 n");

  conferir(medidas, erros);
});

test("rolagem de 100 gastos com o CSS real: no ritmo da tela, sem tarefa longa", async ({ page }) => {
  await abrir(page, "financas", copiaDoMotor({ gastos: 230 }));
  await tocar(page.getByRole("button", { name: /^Carregar mais 50/ }));
  await expect(linhasVisiveis(page)).toHaveCount(100);
  await frearCpu(page);
  const r = await rolarAteOFim(page);
  test.info().annotations.push({ type: "rolagem, CPU 4x", description: `${r.quadros} quadros · p95 ${r.p95.toFixed(1)} ms · ${r.longas} tarefas longas · ${r.alvo}px` });
  expect(r.alvo).toBeGreaterThan(5000);
  expect(r.p95).toBeLessThan(25);
  expect(r.longas).toBe(0);
});

test("linhas de gasto: a altura reservada fora da tela é a real (celular, tablet e computador)", async ({ page }) => {
  const resultados: Record<string, Awaited<ReturnType<typeof alturasDasLinhas>>> = {};
  await abrir(page, "financas", copiaDoMotor({ gastos: 230 }));
  await tocar(page.getByRole("button", { name: /^Carregar mais 50/ }));
  await expect(linhasVisiveis(page)).toHaveCount(100);
  for (const [nome, largura] of [["celular", 390], ["tablet", 768], ["computador", 1280]] as const) {
    await page.setViewportSize({ width: largura, height: 844 });
    resultados[nome] = await alturasDasLinhas(page, "ul:not([style*='none']) > li");
  }
  test.info().annotations.push({ type: "altura das linhas (px)", description: JSON.stringify(resultados) });
  for (const [nome, r] of Object.entries(resultados)) {
    expect(Math.abs(r.reservada - r.mediana) / r.mediana, `${nome}: ${JSON.stringify(r)}`).toBeLessThan(0.15);
  }
});
