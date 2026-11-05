"use client";

import { useSyncExternalStore } from "react";
import { useStatusSync } from "@/lib/sync/motor";

/**
 * Indicador de conectividade + sincronização (canto inferior, acima da área
 * segura do iPhone). Aparece só quando importa:
 *  - sem internet: "Modo Offline — Sincronizando quando a conexão voltar";
 *  - internet de volta e fila sendo enviada: "Sincronizando N alterações…";
 *  - rede ok, mas o servidor não responde: alterações aguardando.
 */

function assinarConexao(aoMudar: () => void) {
  window.addEventListener("online", aoMudar);
  window.addEventListener("offline", aoMudar);
  return () => {
    window.removeEventListener("online", aoMudar);
    window.removeEventListener("offline", aoMudar);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    assinarConexao,
    () => navigator.onLine !== false,
    () => true
  );
}

const plural = (n: number) => (n === 1 ? "1 alteração" : `${n} alterações`);

export function IndicadorOffline() {
  const online = useOnline();
  const status = useStatusSync();

  let texto: string | null = null;
  if (!online) {
    texto = `Modo Offline — Sincronizando quando a conexão voltar${status.pendentes ? ` · ${plural(status.pendentes)} guardada(s) aqui` : ""}`;
  } else if (status.pendentes > 0 && status.enviando) {
    texto = `Sincronizando ${plural(status.pendentes)}…`;
  } else if (status.pendentes > 0 && status.ultimoErro?.startsWith("Sem conexão")) {
    texto = `Sem resposta do servidor · ${plural(status.pendentes)} aguardando`;
  }
  if (!texto) return null;

  return (
    <div
      role="status"
      aria-live="polite"
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
