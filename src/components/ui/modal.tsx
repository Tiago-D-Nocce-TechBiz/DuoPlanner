"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Modal genérico em glassmorphism, centrado sobre um backdrop desfocado.
 * Fecha com ESC, clique no backdrop ou no botão de fechar.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="glass-surface relative w-full max-w-md rounded-2xl p-6">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="font-serif text-xl font-semibold text-heading">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-foreground/70 hover:bg-sand-surface hover:text-heading"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
