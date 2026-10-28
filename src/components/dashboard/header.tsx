"use client";

import { Menu, LogOut, UserCircle2 } from "lucide-react";
import Link from "next/link";

/**
 * Cabeçalho da área autenticada. Em mobile mostra o botão para abrir a Sidebar.
 */
export function Header({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4 backdrop-blur lg:px-8">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-zinc-300 hover:bg-zinc-900 lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 text-sm text-zinc-400 sm:flex">
          <UserCircle2 className="h-5 w-5 text-zinc-500" />
          A dupla
        </span>
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </Link>
      </div>
    </header>
  );
}
