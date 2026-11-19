import { test, type Locator, type Page } from "@playwright/test";

/**
 * Medição de responsividade nos testes de navegador, com a mesma base do
 * INP do Google: Event Timing (atraso da entrada + processamento + até a
 * próxima pintura), uma entrada por interação (toque, tecla).
 *
 * Cuidados para a medida não medir o próprio teste, com a CPU freada:
 *  - sem trace do Playwright (fotografa o DOM a cada ação, na thread
 *    principal): `test.use({ trace: "off" })` nos testes que medem;
 *  - esperas com `waitForFunction` e conta barata no DOM, não `expect` com
 *    localizador (que consulta a árvore de acessibilidade a cada tentativa).
 */

/** Teto do INP "bom" do Google (p75 de campo). */
export const INP_BOM_MS = 200;

export async function frearCpu(page: Page, vezes = 4) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: vezes });
  return cdp;
}

/** Rede "Slow 4G" do Lighthouse: 150 ms de RTT, 1,6 Mbps para baixo, 750 Kbps para cima. */
export const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

export async function frearCelular(page: Page) {
  const cdp = await frearCpu(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  return cdp;
}

type EntradaDeEvento = PerformanceEventTiming & { interactionId?: number };

export async function observarInteracoes(page: Page) {
  await page.evaluate(() => {
    const w = window as typeof window & { __interacoes: number[] };
    w.__interacoes = [];
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries() as EntradaDeEvento[]) if (e.interactionId) w.__interacoes.push(e.duration);
    }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
  });
}

/** Pior interação desde a última leitura, em ms (as de até 16 ms não são relatadas: viram 0). */
export async function piorInteracao(page: Page): Promise<number> {
  // O Event Timing entrega depois da pintura: dois quadros garantem a última.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(() => {
    const w = window as typeof window & { __interacoes: number[] };
    const pior = Math.max(0, ...w.__interacoes);
    w.__interacoes = [];
    return pior;
  });
}

export type Medida = { mediana: number; pior: number; todas: number[] };

/**
 * Repete a interação `vezes` vezes depois de uma rodada de aquecimento (a
 * primeira vez de cada caminho paga a compilação do JavaScript sob a CPU
 * freada: entra no "pior", mas não decide a mediana). `aquecimentos` > 1 para
 * o `next dev`, que compila e otimiza aos poucos e tem picos nas primeiras vezes.
 */
export async function medir(
  page: Page,
  vezes: number,
  acao: (i: number) => Promise<void>,
  aquecimentos = 1
): Promise<Medida> {
  const todas: number[] = [];
  for (let i = -aquecimentos; i < vezes; i++) {
    await acao(i);
    todas.push(await piorInteracao(page));
  }
  const quentes = todas.slice(aquecimentos).sort((a, b) => a - b);
  return { mediana: quentes[Math.floor(quentes.length / 2)], pior: Math.max(...todas), todas };
}

export function anotar(medidas: Record<string, Medida>, tipo = "interações (ms): mediana / pior (1ª vez incluída)") {
  test.info().annotations.push({
    type: tipo,
    description: Object.entries(medidas)
      .map(([k, m]) => `${k}: ${m.mediana} / ${m.pior}`)
      .join(" · "),
  });
}

/** Linhas visíveis em listas (`ul`); a aba escondida pelo `<Activity>` fica com display: none. */
export async function esperarLinhas(page: Page, n: number) {
  await page.waitForFunction(
    (esperado) =>
      [...document.querySelectorAll("ul")]
        .filter((u) => u.style.display !== "none")
        .reduce((total, u) => total + u.children.length, 0) === esperado,
    n,
    { polling: 50 }
  );
}

export async function esperarTexto(page: Page, texto: string) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), texto, { polling: 50 });
}

/** Clique do Playwright: rola até o alvo e espera ele parar de se mover antes de tocar. */
export async function tocar(alvo: Locator) {
  await alvo.click();
}

/**
 * Rola a página inteira em ~3 s, um passo por quadro, medindo o intervalo
 * entre quadros (16,7 ms = 60 fps) e as tarefas longas (> 50 ms).
 */
export async function rolarAteOFim(page: Page) {
  return page.evaluate(async () => {
    const longas: number[] = [];
    const obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => longas.push(e.duration)));
    obs.observe({ type: "longtask" });
    const alvo = document.documentElement.scrollHeight - innerHeight;
    const intervalos: number[] = [];
    await new Promise<void>((fim) => {
      let anterior = performance.now();
      const inicio = anterior;
      const passo = (agora: number) => {
        intervalos.push(agora - anterior);
        anterior = agora;
        const progresso = Math.min(1, (agora - inicio) / 3000);
        scrollTo(0, alvo * progresso);
        if (progresso < 1) requestAnimationFrame(passo);
        else fim();
      };
      requestAnimationFrame(passo);
    });
    obs.disconnect();
    const ordenados = [...intervalos].sort((a, b) => a - b);
    return { quadros: intervalos.length, p95: ordenados[Math.floor(ordenados.length * 0.95)], longas: longas.length, alvo };
  });
}

/**
 * Altura real das linhas contra a reservada pelo `contain-intrinsic-size`
 * (o que o navegador usa para as linhas fora da tela). Reserva errada faz a
 * página pular na rolagem e o alvo de um toque mudar de lugar.
 */
export async function alturasDasLinhas(page: Page, seletor: string) {
  return page.evaluate((sel) => {
    const linhas = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getClientRects().length > 0);
    const reservada = Number.parseFloat(getComputedStyle(linhas[0]).containIntrinsicHeight.replace("auto", ""));
    const forcar = document.createElement("style");
    forcar.textContent = `${sel}{content-visibility:visible!important}`;
    document.head.append(forcar);
    const reais = linhas.map((el) => el.getBoundingClientRect().height).sort((a, b) => a - b);
    forcar.remove();
    const q = (p: number) => Math.round(reais[Math.min(reais.length - 1, Math.floor(reais.length * p))]);
    return { linhas: reais.length, reservada, p10: q(0.1), mediana: q(0.5), p90: q(0.9) };
  }, seletor);
}
