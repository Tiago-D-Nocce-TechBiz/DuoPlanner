"use client";

import { lazy, Suspense, useEffect, useState } from "react";

/**
 * Web Vitals fora do carregamento inicial.
 *
 * A biblioteca `web-vitals` (via `useReportWebVitals`) custava ~3,7 KB gzip
 * em TODAS as rotas, no caminho crítico. Ela lê as entradas de desempenho
 * já guardadas pelo navegador (`buffered: true`), então carregar depois não
 * perde LCP, CLS, FCP nem TTFB, e o INP vê as interações lentas (as acima de
 * 104 ms ficam no buffer). O código só é baixado quando a página fica
 * ociosa, depois da hidratação. Se a pessoa sair antes disso, a visita fica
 * sem medida: a medição é acessória.
 *
 * `lazy` do React em vez de `next/dynamic`: o runtime do React já está no
 * pacote; o do `next/dynamic` somaria ~1 KB em rotas que não o usam.
 */
const Medidor = lazy(() => import("./medidor-web-vitals").then((m) => ({ default: m.MedidorWebVitals })));

export function MonitorWebVitals() {
  const [ocioso, setOcioso] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const pedido = window.requestIdleCallback(() => setOcioso(true), { timeout: 4000 });
      return () => window.cancelIdleCallback(pedido);
    }
    // Safari ainda não tem requestIdleCallback.
    const atraso = window.setTimeout(() => setOcioso(true), 2000);
    return () => window.clearTimeout(atraso);
  }, []);

  return ocioso ? (
    <Suspense fallback={null}>
      <Medidor />
    </Suspense>
  ) : null;
}
