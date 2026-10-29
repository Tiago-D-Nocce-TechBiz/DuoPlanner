"use client";

import { usePathname } from "next/navigation";
import { LogOut, Menu, Plane, Users } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * DashboardHeader — cabeçalho da área autenticada (Premium Dark).
 *
 * - Fundo zinc-950 translúcido com blur e hairline zinc-800 na base.
 * - Esquerda: botão do menu (mobile) + seção atual em Playfair Display.
 * - Direita: badge da dupla, ação principal "Nova busca" (amarelo pastel,
 *   texto preto) e saída discreta (ghost).
 *
 * O título da seção vem de NAV_ITEMS (fonte única do menu), escolhendo o
 * prefixo de rota mais longo que corresponde ao pathname atual.
 */
function useSectionTitle(): string {
  const pathname = usePathname();
  const match = NAV_ITEMS.filter((item) =>
    item.href === "/dashboard"
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
  ).sort((a, b) => b.href.length - a.href.length)[0];

  if (match) return match.label;
  if (pathname.startsWith("/dashboard/termos")) return "Termos & LGPD";
  return "Painel";
}

export function DashboardHeader({ onMenu }: { onMenu: () => void }) {
  const title = useSectionTitle();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 lg:h-20 lg:px-8">
        <button
          type="button"
          onClick={onMenu}
          className="rounded-lg p-2 text-muted transition-colors hover:bg-card hover:text-heading lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.22em] text-subtle sm:block">
            Painel da dupla
          </p>
          <p className="truncate font-serif text-xl font-semibold text-heading lg:text-2xl">
            {title}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Badge variant="outline" className="hidden md:inline-flex">
            <Users className="h-3.5 w-3.5" />
            Duo · 2 viajantes
          </Badge>

          <Button href="/dashboard/buscar-viagem" variant="primary" size="sm">
            <Plane className="h-4 w-4" />
            <span className="hidden sm:inline">Nova busca</span>
          </Button>

          <Button
            href="/login"
            variant="ghost"
            size="sm"
            className="px-2.5"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">Sair</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
