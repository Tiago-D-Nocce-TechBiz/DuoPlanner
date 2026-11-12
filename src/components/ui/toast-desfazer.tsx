"use client";

import { createPortal } from "react-dom";
import { Undo, X } from "@/components/ui/icons";

/**
 * Aviso "removido · Desfazer" com a contagem do prazo (barra que encolhe).
 * Fica acima do aviso de conexão no celular e no canto inferior esquerdo no
 * computador. Não rouba o foco.
 *
 * Renderizado em `document.body` (portal): dentro de um `.glass-panel`, o
 * `backdrop-filter` do painel prenderia o `position: fixed` ao próprio painel.
 * Só aparece depois de uma ação no navegador, então nunca roda no servidor.
 */
export function ToastDesfazer({
  mensagem,
  duracaoMs,
  onDesfazer,
  onFechar,
}: {
  mensagem: string;
  duracaoMs: number;
  onDesfazer: () => void;
  /** Fecha o aviso efetivando a ação na hora. */
  onFechar: () => void;
}) {
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-toast-desfazer
      className="fixed inset-x-3 z-[72] mx-auto max-w-sm overflow-hidden rounded-2xl glass-panel shadow-2xl bottom-[calc(3.5rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:left-6 sm:mx-0 sm:bottom-6"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-xs text-[var(--color-heading)]">{mensagem}</p>
        <button
          type="button"
          onClick={onDesfazer}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-accent-foreground)] cursor-pointer"
        >
          <Undo className="h-3.5 w-3.5" />
          Desfazer
        </button>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar aviso"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:text-[var(--color-heading)] cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div aria-hidden className="h-0.5 bg-[var(--color-border)]">
        <div className="pd-contagem h-full bg-[var(--color-accent)]" style={{ animationDuration: `${duracaoMs}ms` }} />
      </div>
    </div>,
    document.body
  );
}
