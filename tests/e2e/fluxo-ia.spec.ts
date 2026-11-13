import { expect, test } from "@playwright/test";
import { abrirPainel } from "./apoio";

/**
 * Respostas em fluxo na tela: Experiências Ocultas (NDJSON de
 * /api/experiencias) e a Nora (texto palavra por palavra).
 *
 * Sem Gemini nem sessão no ambiente de teste, o `fetch` da página para
 * /api/experiencias devolve um fluxo controlado pelo teste (a rota em si é
 * coberta no Vitest, inclusive contra um SSE do Gemini). O resto é o real:
 * leitura do NDJSON, estado, cards e acessibilidade.
 */

const GEMS = [1, 2, 3].map((n) => ({
  nome: ["Miradouro de Santa Luzia", "Feira da Ladra", "Jardim da Estrela"][n - 1],
  descricao: `Sugestão número ${n} para a dupla.`,
  custo: "gratuito",
  custo_estimado: "Grátis",
  melhor_momento: "Fim de tarde",
  dica_local: "Vá a pé pelo bairro.",
}));

test("experiências ocultas: começam junto com a busca de preços e o 1º card aparece antes de a IA terminar", async ({ page }) => {
  await page.addInitScript((gems) => {
    type Janela = typeof window & {
      __gems: { inicioMs: number; corpo: string; liberar: () => void };
      __hoteisMs: number;
    };
    const w = window as Janela;
    const original = window.fetch.bind(window);
    window.fetch = (entrada, init) => {
      const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      if (url.includes("/api/hotels")) {
        return original(entrada, init).then((r) => {
          w.__hoteisMs = performance.now();
          return r;
        });
      }
      if (!url.includes("/api/experiencias")) return original(entrada, init);

      let liberar = () => {};
      const segundaParte = new Promise<void>((r) => (liberar = r));
      w.__gems = { inicioMs: performance.now(), corpo: String(init?.body ?? ""), liberar };
      const codificador = new TextEncoder();
      const linha = (e: unknown) => codificador.encode(`${JSON.stringify(e)}\n`);
      const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const corpo = new ReadableStream<Uint8Array>({
        async start(c) {
          c.enqueue(linha({ tipo: "inicio", destino: "Lisboa", contexto: ["Passeios só gratuitos"] }));
          await pausa(40);
          c.enqueue(linha({ tipo: "rascunho", indice: 0, experiencia: { nome: "Miradouro" } }));
          await pausa(40);
          c.enqueue(linha({ tipo: "experiencia", indice: 0, experiencia: gems[0] }));
          c.enqueue(linha({ tipo: "rascunho", indice: 1, experiencia: { nome: "Feira da", descricao: "Antiguidades e" } }));
          await segundaParte;
          c.enqueue(linha({ tipo: "experiencia", indice: 1, experiencia: gems[1] }));
          c.enqueue(linha({ tipo: "experiencia", indice: 2, experiencia: gems[2] }));
          c.enqueue(linha({ tipo: "fim" }));
          c.close();
        },
      });
      return Promise.resolve(new Response(corpo, { headers: { "content-type": "application/x-ndjson" } }));
    };
  }, GEMS);

  await abrirPainel(page, "/dashboard/buscar-hospedagem");
  // A busca de preços demora 1,5 s (provedor lento) e falha: as sugestões não dependem dela.
  await page.route("**/api/hotels?**", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Motor de hospedagem indisponível no teste.", code: "BOOKING_NOT_CONFIGURED" }),
    });
  });

  await page.getByLabel("Destino").fill("Lisboa");
  await page.getByLabel("Check-in").fill("2027-03-10");
  await page.getByLabel("Check-out").fill("2027-03-15");
  await page.getByRole("button", { name: "Buscar hospedagens" }).click();

  const secao = page.getByRole("region", { name: "Experiências ocultas no destino" });
  await expect(secao).toBeVisible();
  const tempos = await page.evaluate(() => {
    const w = window as typeof window & { __gems: { inicioMs: number; corpo: string }; __hoteisMs: number };
    return { gems: w.__gems.inicioMs, hoteis: w.__hoteisMs, corpo: w.__gems.corpo };
  });
  // O pedido das sugestões saiu no submit, mais de 1 s antes de a busca de preços voltar.
  expect(tempos.hoteis - tempos.gems).toBeGreaterThan(1000);
  expect(JSON.parse(tempos.corpo)).toEqual({ destino: "Lisboa", dataViagem: "2027-03-10" });

  // 1º card pronto; o 2º ainda sendo escrito; a seção avisa que está ocupada.
  await expect(secao.getByRole("heading", { name: "Miradouro de Santa Luzia" })).toBeVisible();
  await expect(secao.getByRole("heading", { name: "Feira da" })).toBeVisible();
  await expect(secao).toHaveAttribute("aria-busy", "true");
  await expect(secao.getByRole("status")).toHaveText("1 de 3 sugestões prontas.");
  await expect(secao.getByText("Considerando a memória da dupla: Passeios só gratuitos")).toBeVisible();

  await page.evaluate(() => (window as typeof window & { __gems: { liberar: () => void } }).__gems.liberar());
  await expect(secao.getByRole("heading", { level: 3 })).toHaveCount(3);
  await expect(secao.getByRole("heading", { name: "Feira da Ladra" })).toBeVisible();
  await expect(secao).toHaveAttribute("aria-busy", "false");
  await expect(secao.getByRole("status")).toHaveText("3 sugestões prontas em Lisboa.");
  await expect(secao.getByText("Sugestões geradas por IA. Confira horários e regras antes de ir.")).toBeVisible();
});

/** Amostra, a cada quadro, quantos caracteres da resposta da Nora estão visíveis. */
async function amostrarTextoDaNora(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const w = window as typeof window & { __amostras: { ms: number; visiveis: number; total: number }[] };
    w.__amostras = [];
    const inicio = performance.now();
    const passo = () => {
      const fluxo = document.querySelector<HTMLElement>("[data-em-fluxo] [data-texto-em-fluxo]");
      const resposta = document.querySelector<HTMLElement>("[data-nora-resposta]");
      if (fluxo) {
        const oculto = fluxo.querySelector(".invisible")?.textContent?.length ?? 0;
        const total = fluxo.textContent?.length ?? 0;
        w.__amostras.push({ ms: performance.now() - inicio, visiveis: total - oculto, total });
      } else if (resposta) {
        w.__amostras.push({ ms: performance.now() - inicio, visiveis: -1, total: -1 });
        return; // terminou de escrever
      }
      if (performance.now() - inicio < 6000) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  });
}

test("Nora: a 1ª palavra sai em menos de 1 s e o texto cresce; os cards de ação só aparecem no fim", async ({ page }) => {
  await abrirPainel(page, "/dashboard");
  await page.getByRole("button", { name: "Perguntar à Nora" }).click();
  const nora = page.getByRole("dialog", { name: "Nora — assistente de IA" });
  await expect(nora.getByRole("button", { name: "Como funciona o sistema e convite da dupla?" })).toBeVisible();

  await amostrarTextoDaNora(page);
  await nora.getByRole("button", { name: "Como funciona o sistema e convite da dupla?" }).click();

  // Enquanto escreve, as ações estão no lugar (sem pulo de layout), mas invisíveis.
  const escrevendo = page.locator("[data-nora-resposta][data-em-fluxo]");
  await expect(escrevendo).toBeVisible();
  await expect(escrevendo.locator("[data-acoes-nora]")).toHaveClass(/invisible/);

  await expect(page.locator("[data-nora-resposta]:not([data-em-fluxo])")).toBeVisible({ timeout: 4000 });
  await expect(page.locator("[data-acoes-nora]").first()).not.toHaveClass(/invisible/);

  const amostras = await page.evaluate(
    () => (window as typeof window & { __amostras: { ms: number; visiveis: number; total: number }[] }).__amostras
  );
  const escritas = amostras.filter((a) => a.visiveis > 0);
  expect(escritas.length).toBeGreaterThan(3);
  // Primeira palavra: pausa de 400 ms + um quadro. Antes eram 1,4 a 3 s de pontinhos.
  expect(escritas[0].ms).toBeLessThan(1000);
  expect(escritas[0].visiveis).toBeLessThan(escritas[0].total);
  // Cresce sem voltar, até o texto todo.
  for (let i = 1; i < escritas.length; i++) expect(escritas[i].visiveis).toBeGreaterThanOrEqual(escritas[i - 1].visiveis);
  expect(new Set(escritas.map((a) => a.visiveis)).size).toBeGreaterThan(3);
  const fim = amostras.find((a) => a.visiveis === -1);
  expect(fim?.ms).toBeLessThan(2500);
  test.info().annotations.push({
    type: "Nora (ms desde o clique)",
    description: `1ª palavra ${escritas[0].ms.toFixed(0)} · resposta inteira ${fim?.ms.toFixed(0)} (antes: 1400–3000 até qualquer texto)`,
  });
});

test("Nora com 'reduzir movimento': a resposta aparece inteira de uma vez", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await abrirPainel(page, "/dashboard");
  await page.getByRole("button", { name: "Perguntar à Nora" }).click();
  const nora = page.getByRole("dialog", { name: "Nora — assistente de IA" });
  await amostrarTextoDaNora(page);
  await nora.getByRole("button", { name: "Como funciona o sistema e convite da dupla?" }).click();
  await expect(page.locator("[data-nora-resposta]:not([data-em-fluxo])")).toBeVisible({ timeout: 4000 });
  const amostras = await page.evaluate(
    () => (window as typeof window & { __amostras: { visiveis: number; total: number }[] }).__amostras
  );
  const parciais = amostras.filter((a) => a.visiveis >= 0 && a.visiveis < a.total);
  expect(parciais).toHaveLength(0);
});
