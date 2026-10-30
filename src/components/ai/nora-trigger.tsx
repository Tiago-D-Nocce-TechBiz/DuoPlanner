"use client";

import { useEffect } from "react";
import { NoraAvatar } from "./nora-avatar";
import { useNora } from "./nora-provider";

/**
 * Botão "Perguntar à Nora" no cabeçalho do Dashboard.
 *
 * Cápsula em glassmorphism com leve brilho safira. Atalho de teclado Alt+N
 * (e Ctrl+K) abre o painel de qualquer tela.
 */
export function NoraTrigger() {
  const { abrir } = useNora();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const altN = e.altKey && (e.key === "n" || e.key === "N");
      const ctrlK = (e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K");
      if (altN || ctrlK) {
        e.preventDefault();
        abrir();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abrir]);

  return (
    <button
      type="button"
      onClick={abrir}
      title="Perguntar à Nora (Alt+N)"
      className="group inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-[var(--color-card)] px-4 py-2 text-xs font-semibold text-[var(--color-heading)] shadow-[0_0_20px_rgba(59,130,246,0.12)] backdrop-blur-md transition-all hover:shadow-[0_0_28px_rgba(59,130,246,0.22)] hover:border-blue-500/50 cursor-pointer"
    >
      <NoraAvatar tamanho={22} />
      Perguntar à Nora
    </button>
  );
}
