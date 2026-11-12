"use client";

import { useEffect } from "react";
import { emProducao } from "@/lib/env/modo";

/**
 * Registra o Service Worker (`public/sw.js`) — só em produção: em
 * desenvolvimento ele brigaria com o hot reload. `updateViaCache: "none"`
 * faz o navegador sempre buscar o sw.js novo (o cabeçalho também proíbe cache).
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!emProducao || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Navegador sem suporte ou bloqueado: o app funciona online normalmente.
    });
  }, []);
  return null;
}

const CHAVE_AQUECIDO = "pd-pwa-aquecido";

/**
 * No painel (logado e online), pede ao Service Worker para guardar as
 * páginas que precisam abrir offline (roteiro, checklist, conversor...), com
 * os arquivos de cada uma. Uma vez por sessão do navegador; o logout limpa
 * a marca (`pd-*`) e os caches com páginas do usuário.
 */
export function AquecerCacheOffline() {
  useEffect(() => {
    if (!emProducao || !("serviceWorker" in navigator)) return;
    let cancelado = false;
    navigator.serviceWorker.ready
      .then((registro) => {
        if (cancelado || !navigator.onLine) return;
        try {
          if (window.sessionStorage.getItem(CHAVE_AQUECIDO)) return;
          window.sessionStorage.setItem(CHAVE_AQUECIDO, "1");
        } catch {
          // sem sessionStorage: aquece mesmo assim
        }
        registro.active?.postMessage({ tipo: "aquecer" });
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);
  return null;
}
