"use client";

import { useReportWebVitals } from "next/web-vitals";
import { emProducao } from "@/lib/env/modo";
import { METRICAS, type NomeMetrica } from "@/lib/observabilidade/metricas";

/**
 * Mede LCP, INP e CLS (e FCP, TTFB) de quem usa o app.
 *
 * - Em desenvolvimento: uma linha no console por métrica, com a nota.
 * - Em produção: junta as métricas da página e manda num único
 *   `sendBeacon` para `/api/vitals` quando a aba é escondida ou fechada
 *   (é quando o INP e o CLS ficam definitivos). Não atrasa nada: o beacon
 *   sai em segundo plano, sem esperar resposta.
 *
 * Carregado sob demanda por `MonitorWebVitals` (`monitor-web-vitals.tsx`),
 * depois que a página fica ociosa. A referência da função é estável (não
 * duplica envio).
 */

type Metrica = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

const ACOMPANHADAS = new Set<string>(METRICAS);
const pendentes = new Map<string, { nome: NomeMetrica; valor: number; nota: string; id: string; navegacao?: string; pagina: string }>();
let ouvindo = false;

function enviar() {
  if (pendentes.size === 0) return;
  const corpo = JSON.stringify({ metricas: [...pendentes.values()].slice(0, 10) });
  pendentes.clear();
  try {
    const foi = navigator.sendBeacon?.("/api/vitals", new Blob([corpo], { type: "application/json" }));
    if (!foi) void fetch("/api/vitals", { method: "POST", body: corpo, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // Medição é acessória: nunca atrapalha a página.
  }
}

function registrar(m: Metrica) {
  if (!ACOMPANHADAS.has(m.name)) return;
  if (!emProducao) {
    const valor = m.name === "CLS" ? m.value.toFixed(3) : `${Math.round(m.value)} ms`;
    console.info(`[web-vitals] ${m.name} ${valor} (${m.rating})`);
    return;
  }
  // Por id: a mesma métrica reportada de novo (CLS e INP crescem) substitui a anterior.
  pendentes.set(m.id, {
    nome: m.name as NomeMetrica,
    valor: m.value,
    nota: m.rating,
    id: m.id,
    navegacao: m.navigationType,
    pagina: location.pathname,
  });
  if (!ouvindo) {
    ouvindo = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") enviar();
    });
    window.addEventListener("pagehide", enviar);
  }
}

export function MedidorWebVitals() {
  useReportWebVitals(registrar);
  return null;
}
