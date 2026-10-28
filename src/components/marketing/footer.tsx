import { Logo } from "@/components/ui/logo";
import { Container } from "@/components/ui/container";

// Ano de copyright como constante: evita `new Date()` no prerender
// (Cache Components) e mantém o rodapé totalmente estático.
const COPYRIGHT_YEAR = 2026;

/** Rodapé público. */
export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <Container className="flex flex-col items-center justify-between gap-4 py-10 md:flex-row">
        <div className="flex flex-col items-center gap-2 md:items-start">
          <Logo />
          <p className="text-xs text-zinc-500">
            Aplicação pessoal de planeamento de viagens. 100% gratuita.
          </p>
        </div>
        <p className="text-xs text-zinc-600">
          © {COPYRIGHT_YEAR} PlannerDuo — Uso pessoal, não corporativo.
        </p>
      </Container>
    </footer>
  );
}
