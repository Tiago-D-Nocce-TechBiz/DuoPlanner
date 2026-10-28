"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { LogoutLogo } from "./logout-logo";
import { cn } from "@/lib/utils";
import { X, ScrollText } from "lucide-react";

/**
 * Barra lateral esquerda (Sidebar) — superfície glass, adaptativa ao tema.
 *
 * - Em lg+: fixa à esquerda, sempre visível.
 * - Em mobile: drawer sobre overlay (estado `open` vindo do layout).
 * - Logo (LogoutLogo) abre modal de confirmação de saída.
 * - Rodapé: link "Termos de uso & LGPD".
 * - Item ativo em cor de ação primária (adaptativa ao tema).
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
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "glass-panel fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sand-border ring-1 ring-sand-border/50 transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sand-border px-5">
          <LogoutLogo />
          <button
            onClick={onClose}
            className="rounded-md p-1 text-foreground/70 hover:bg-sand-surface hover:text-heading lg:hidden"
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
                    ? "bg-accent-ink text-accent-on font-medium"
                    : "text-foreground hover:bg-sand-surface hover:text-heading"
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sand-border p-4">
          <Link
            href="/dashboard/termos"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-leather transition-colors hover:bg-sand-surface hover:text-heading"
          >
            <ScrollText className="h-4 w-4" />
            Termos de uso &amp; LGPD
          </Link>
        </div>
      </aside>
    </>
  );
}
