import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

/** Barra de navegação pública (Landing Page) — superfície glass. */
export function PublicNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/80 bg-[#FAF8F5]/70 backdrop-blur-xl ring-1 ring-[#E6E0D4]/40">
      <Container className="flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#recursos" className="text-sm text-[#57534E] hover:text-[#1C1917]">
            Recursos
          </a>
          <a href="#como-funciona" className="text-sm text-[#57534E] hover:text-[#1C1917]">
            Como funciona
          </a>
          <a href="#financas" className="text-sm text-[#57534E] hover:text-[#1C1917]">
            Finanças Duo
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button href="/login" variant="ghost" size="sm">
            Entrar
          </Button>
          <Button href="/registo" variant="primary" size="sm">
            Criar conta
          </Button>
        </div>
      </Container>
    </header>
  );
}
