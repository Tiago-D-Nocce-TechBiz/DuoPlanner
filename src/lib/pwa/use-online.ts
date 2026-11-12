"use client";

import { useSyncExternalStore } from "react";

/**
 * Conexão do navegador (`navigator.onLine` + eventos online/offline).
 * No servidor e na hidratação vale "online", para não piscar um aviso falso.
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
