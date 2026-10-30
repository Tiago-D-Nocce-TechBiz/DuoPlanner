"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/logo";
import { FlightRoute3D } from "@/components/marketing/flight-route-3d";

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
          <BrandLogo href="/" />

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
        {/* Avião 3D realista interativo (gire segurando o mouse) */}
        <FlightRoute3D className="w-full max-w-2xl h-60 sm:h-72 mb-6" />

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
        <span>© {COPYRIGHT_YEAR} DuoPlanner. Todos os direitos reservados.</span>
        <Link className="hover:underline" href="/termos">
          Termos de Uso & LGPD
        </Link>
      </footer>
    </div>
  );
}
