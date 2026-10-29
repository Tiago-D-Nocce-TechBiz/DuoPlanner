import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

/** Navbar flutuante da Landing Page (zinc-950 translúcido + borda sutil). */
export function PublicNav() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <header className="pointer-events-auto flex h-16 w-full max-w-5xl items-center justify-between rounded-2xl border border-border bg-background/80 px-5 backdrop-blur-xl">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#recursos" className="text-sm text-muted transition-colors hover:text-heading">
            Recursos
          </a>
          <a href="#como-funciona" className="text-sm text-muted transition-colors hover:text-heading">
            Como funciona
          </a>
          <a href="#financas" className="text-sm text-muted transition-colors hover:text-heading">
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
      </header>
    </div>
  );
}
