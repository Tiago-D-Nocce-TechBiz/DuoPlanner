"use client";

import { useEffect, useState } from "react";
import { useOnline } from "@/lib/pwa/use-online";
import { useStatusSync } from "@/lib/sync/motor";

/**
 * Aviso flutuante de conexão (canto inferior, acima da área segura do
 * iPhone). Complementa o selo do cabeçalho (`SyncStatusBadge`): aparece só
 * quando o cabeçalho saiu da tela (página rolada) ou quando o selo não está
 * ativo, para a mesma informação nunca aparecer duas vezes.
 *  - sem internet: "Modo Offline — Sincronizando quando a conexão voltar";
 *  - rede ok, mas o servidor não responde: alterações aguardando.
 */

const plural = (n: number) => (n === 1 ? "1 alteração" : `${n} alterações`);

/** O cabeçalho do painel (onde fica o selo) está visível? */
function useCabecalhoVisivel(): boolean {
  const [visivel, setVisivel] = useState(true);
  useEffect(() => {
    const cabecalho = document.querySelector("[data-cabecalho-painel]");
    if (!cabecalho || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([entrada]) => setVisivel(entrada.isIntersecting));
    observador.observe(cabecalho);
    return () => observador.disconnect();
  }, []);
  return visivel;
}

export function IndicadorOffline() {
  const online = useOnline();
  const status = useStatusSync();
  const cabecalhoVisivel = useCabecalhoVisivel();
  const seloAtivo = status.modo !== "inativo";

  let texto: string | null = null;
  if (!online) {
    texto = `Modo Offline — Sincronizando quando a conexão voltar${status.pendentes ? ` · ${plural(status.pendentes)} guardada(s) aqui` : ""}`;
  } else if (status.pendentes > 0 && status.semServidor) {
    texto = `Sem resposta do servidor · ${plural(status.pendentes)} aguardando`;
  }
  if (!texto || (seloAtivo && cabecalhoVisivel)) return null;

  return (
    <div
      // Com o selo ativo, ele já anuncia a mudança ao leitor de tela.
      role={seloAtivo ? undefined : "status"}
      aria-hidden={seloAtivo || undefined}
      data-aviso-offline
      className="fixed left-1/2 z-[70] -translate-x-1/2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg bg-[var(--color-accent)] text-[var(--color-accent-foreground)] max-w-[92vw] text-center"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <span
        aria-hidden
        className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${online ? "bg-amber-400 animate-pulse" : "bg-red-500"}`}
      />
      {texto}
    </div>
  );
}
