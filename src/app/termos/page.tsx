import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/logo";
import { TermsContent } from "@/components/legal/terms-content";

export const metadata = { title: "Termos de uso & LGPD — DuoPlanner" };

// Ano de copyright como constante (evita new Date() no prerender).
const COPYRIGHT_YEAR = 2026;

/**
 * Página pública de Termos de Uso e LGPD.
 * Usa a mesma identidade visual "Cartografia Editorial" da landing (navbar
 * flutuante glass + rodapé), para consistência com o restante do site.
 */
export default function TermosPublicPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between px-4 sm:px-6 lg:px-8 pb-12">
      {/* Navbar flutuante */}
      <header className="sticky top-4 z-50 mx-auto w-full max-w-4xl">
        <nav className="glass-panel rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4 bg-[var(--color-elevated)] shadow-lg">
          <BrandLogo href="/" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/"
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-[var(--color-foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              ← Início
            </Link>
          </div>
        </nav>
      </header>

      {/* Conteúdo jurídico */}
      <main className="mx-auto w-full max-w-4xl pt-10 sm:pt-12">
        <div className="glass-panel rounded-3xl p-6 sm:p-10 md:p-12">
          <TermsContent />
        </div>
      </main>

      {/* Rodapé */}
      <footer className="mx-auto w-full max-w-4xl mt-16 pt-8 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-muted)]">
        <span>© {COPYRIGHT_YEAR} DuoPlanner. Todos os direitos reservados.</span>
        <div className="flex items-center gap-6">
          <Link className="hover:underline" href="/login">
            Entrar
          </Link>
          <Link className="hover:underline" href="/dashboard">
            Painel de Controle
          </Link>
        </div>
      </footer>
    </div>
  );
}
