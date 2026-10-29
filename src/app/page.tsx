"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { PlaneEmblem } from "@/components/marketing/plane-emblem";

// Ano de copyright como constante: evita `new Date()` no prerender
// (Cache Components) e mantém o rodapé totalmente estático.
const COPYRIGHT_YEAR = 2026;

// Resumo curto do que o sistema faz — chips discretos, sem poluição visual.
const DESTAQUES = [
  "Passagens aéreas e de ônibus",
  "Hospedagens",
  "Roteiro a dois",
  "Divisão de despesas",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between px-4 sm:px-6 lg:px-8 pb-12">
      {/* Navbar flutuante */}
      <header className="sticky top-4 z-50 mx-auto w-full max-w-5xl">
        <nav className="glass-panel rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4 bg-[var(--color-elevated)] shadow-lg">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-serif text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-heading)]"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-foreground)] text-sm font-sans">
              ✦
            </span>
            <span>PlannerDuo</span>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-[var(--color-foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-sm hover:opacity-90 transition-all"
            >
              Criar conta
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero focado */}
      <main className="mx-auto w-full max-w-3xl flex-1 flex flex-col items-center justify-center text-center py-16 sm:py-20">
        <PlaneEmblem className="h-28 w-28 sm:h-32 sm:w-32 mb-8" />

        <div className="inline-flex items-center gap-2 rounded-full glass-panel px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-6">
          <span>🧭</span>
          <span>Planejamento de viagens a dois</span>
        </div>

        <h1 className="font-serif text-4xl sm:text-6xl font-bold tracking-tight text-[var(--color-heading)] leading-[1.1]">
          Planejem a próxima viagem, juntos e sem estresse
        </h1>

        <p className="mt-5 text-base sm:text-lg text-[var(--color-muted)] leading-relaxed max-w-xl">
          Compare passagens e hospedagens, monte o roteiro e divida as despesas
          da viagem de forma simples, sincronizada e privada.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login"
            className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-md hover:scale-[1.02] transition-all"
          >
            Começar agora →
          </Link>
          <Link
            href="/login"
            className="px-6 py-3.5 rounded-xl font-semibold text-sm glass-panel hover:bg-black/5 dark:hover:bg-white/10 transition-all"
          >
            Entrar na minha conta
          </Link>
        </div>

        {/* Destaques como chips discretos */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
          {DESTAQUES.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[var(--color-border)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-muted)]"
            >
              {item}
            </span>
          ))}
        </div>
      </main>

      {/* Rodapé */}
      <footer className="mx-auto w-full max-w-5xl pt-8 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-muted)]">
        <span>© {COPYRIGHT_YEAR} PlannerDuo. Todos os direitos reservados.</span>
        <div className="flex items-center gap-6">
          <Link className="hover:underline" href="/termos">
            Termos de Uso & LGPD
          </Link>
          <Link className="hover:underline" href="/login">
            Entrar
          </Link>
        </div>
      </footer>
    </div>
  );
}
