import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/** Navbar flutuante translúcida (glassmorphism) da Landing Page. */
export function PublicNav() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <header className="glass-surface pointer-events-auto flex h-16 w-full max-w-5xl items-center justify-between rounded-2xl px-5">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#recursos" className="text-sm text-foreground hover:text-heading">
            Recursos
          </a>
          <a href="#como-funciona" className="text-sm text-foreground hover:text-heading">
            Como funciona
          </a>
          <a href="#financas" className="text-sm text-foreground hover:text-heading">
            Finanças Duo
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
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
