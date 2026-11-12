"use client";

import { useEffect } from "react";
import { NoraAvatar } from "./nora-avatar";
import { useNora } from "./nora-provider";
import { preCarregarNora } from "./nora-sob-demanda";

/**
 * Botão "Perguntar à Nora" no cabeçalho do Dashboard. Ponteiro ou foco nele
 * já pré-busca o painel (carregado sob demanda), para abrir sem espera.
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

  // No celular fica só o avatar (o texto completo vai no nome acessível):
  // com o texto, o cabeçalho não cabia em 390 px.
  return (
    <button
      type="button"
      onClick={abrir}
      onPointerEnter={preCarregarNora}
      onFocus={preCarregarNora}
      title="Perguntar à Nora (Alt+N)"
      aria-label="Perguntar à Nora"
      className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-blue-500/30 bg-[var(--color-card)] p-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-[var(--color-heading)] shadow-[0_0_20px_rgba(59,130,246,0.12)] backdrop-blur-md transition-all hover:shadow-[0_0_28px_rgba(59,130,246,0.22)] hover:border-blue-500/50 cursor-pointer"
    >
      <NoraAvatar tamanho={22} />
      <span className="hidden sm:inline">Perguntar à Nora</span>
    </button>
  );
}
