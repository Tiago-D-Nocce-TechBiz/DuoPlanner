"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * Barra lateral esquerda (Sidebar) com o menu principal — superfície glass.
 *
 * - Em ecrãs grandes (lg+): fixa à esquerda, sempre visível.
 * - Em telemóveis/tablets: escondida por omissão; aberta como "drawer" sobre
 *   um overlay, controlada pelo estado `open` vindo do layout.
 * - Item ativo em Espresso profundo (#1C1917).
 */
export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Overlay para mobile quando aberta */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#1C1917]/20 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#FAF8F5]/75 backdrop-blur-xl border-r border-white/80 ring-1 ring-[#E6E0D4]/70 shadow-[0_10px_35px_-5px_rgba(28,25,23,0.05)] transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#E6E0D4]/70 px-5">
          <Logo href="/dashboard" />
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[#57534E] hover:bg-[#EFECE6] hover:text-[#1C1917] lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === href
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-[#1C1917] text-[#FAF8F5] font-medium shadow-[0_6px_20px_-6px_rgba(28,25,23,0.35)]"
                    : "text-[#57534E] hover:bg-[#EFECE6] hover:text-[#1C1917]"
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#E6E0D4]/70 p-4">
          <p className="text-xs text-[#A8A29E]">
            PlannerDuo — pessoal e gratuito.
          </p>
        </div>
      </aside>
    </>
  );
}
