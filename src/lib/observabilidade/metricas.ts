/**
 * Métricas de Web Vitals acompanhadas. Módulo sem dependências de propósito:
 * o `MonitorWebVitals` vai em todas as páginas e não pode trazer o zod junto
 * (a validação fica em `web-vitals.ts`, só no servidor).
 */
export const METRICAS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type NomeMetrica = (typeof METRICAS)[number];
