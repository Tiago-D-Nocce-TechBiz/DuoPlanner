import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

/** Barra de navegação pública (Landing Page). */
export function PublicNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#recursos" className="text-sm text-zinc-400 hover:text-zinc-100">
            Recursos
          </a>
          <a href="#como-funciona" className="text-sm text-zinc-400 hover:text-zinc-100">
            Como funciona
          </a>
          <a href="#financas" className="text-sm text-zinc-400 hover:text-zinc-100">
            Finanças Duo
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button href="/login" variant="ghost" size="sm">
            Iniciar sessão
          </Button>
          <Button href="/registo" variant="primary" size="sm">
            Criar conta
          </Button>
        </div>
      </Container>
    </header>
  );
}
