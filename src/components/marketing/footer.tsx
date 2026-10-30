import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

// Ano de copyright como constante: evita `new Date()` no prerender
// (Cache Components) e mantém o rodapé totalmente estático.
const COPYRIGHT_YEAR = 2026;

/** Rodapé público com links para Termos de Uso e LGPD. */
export function Footer() {
  return (
    <footer className="border-t border-border">
      <Container className="flex flex-col items-center justify-between gap-4 py-10 md:flex-row">
        <div className="flex flex-col items-center gap-2 md:items-start">
          <Logo />
          <p className="text-xs text-subtle">
            App pessoal de planejamento de viagens. 100% gratuito.
          </p>
        </div>

        <nav className="flex items-center gap-5 text-xs">
          <Link href="/termos" className="text-muted transition-colors hover:text-heading">
            Termos de uso
          </Link>
          <Link href="/termos#lgpd" className="text-muted transition-colors hover:text-heading">
            LGPD &amp; Privacidade
          </Link>
        </nav>

        <p className="text-xs text-subtle">
          © {COPYRIGHT_YEAR} DuoPlanner — Uso pessoal, não corporativo.
        </p>
      </Container>
    </footer>
  );
}
