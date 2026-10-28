"use client";

import { Menu, LogOut, UserCircle2 } from "lucide-react";
import Link from "next/link";

/**
 * Cabeçalho da área autenticada — superfície glass.
 * Em mobile mostra o botão para abrir a Sidebar.
 */
export function Header({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/80 bg-[#FAF8F5]/75 px-4 backdrop-blur-xl ring-1 ring-[#E6E0D4]/40 lg:px-8">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-[#57534E] hover:bg-[#EFECE6] hover:text-[#1C1917] lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 text-sm text-[#57534E] sm:flex">
          <UserCircle2 className="h-5 w-5 text-[#A8A29E]" />
          A dupla
        </span>
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-xl border border-[#DFD9CE] bg-[#EFECE6] px-3 py-2 text-sm text-[#292524] transition-colors hover:bg-[#E6E1D6]"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </Link>
      </div>
    </header>
  );
}
