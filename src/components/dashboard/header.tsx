"use client";

import { Menu, LogOut } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Cabeçalho da área autenticada — superfície glass.
 * - Mobile: botão para abrir a Sidebar.
 * - Direita: alternância de tema (Sol/Lua) + sair.
 */
export function Header({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="glass-panel sticky top-0 z-30 flex h-16 items-center justify-between border-b border-sand-border px-4 ring-1 ring-sand-border/40 lg:px-8">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-foreground hover:bg-sand-surface hover:text-heading lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-xl border border-sand-border bg-sand-surface px-3 py-2 text-sm text-heading transition-colors hover:bg-sand-surface-hover"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </Link>
      </div>
    </header>
  );
}
