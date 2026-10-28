import { Logo } from "@/components/ui/logo";
import { Container } from "@/components/ui/container";

// Ano de copyright como constante: evita `new Date()` no prerender
// (Cache Components) e mantém o rodapé totalmente estático.
const COPYRIGHT_YEAR = 2026;

/** Rodapé público. */
export function Footer() {
  return (
    <footer className="border-t border-[#E6E0D4]/70">
      <Container className="flex flex-col items-center justify-between gap-4 py-10 md:flex-row">
        <div className="flex flex-col items-center gap-2 md:items-start">
          <Logo />
          <p className="text-xs text-[#78716C]">
            App pessoal de planejamento de viagens. 100% gratuito.
          </p>
        </div>
        <p className="text-xs text-[#A8A29E]">
          © {COPYRIGHT_YEAR} PlannerDuo — Uso pessoal, não corporativo.
        </p>
      </Container>
    </footer>
  );
}
