import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Layout partilhado das páginas de autenticação (login e registo).
 * Cartão glass centralizado sobre o fundo com degradê (tema Claro/Escuro).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="relative mb-8">
        <Logo />
      </div>
      <div className="glass-surface relative w-full max-w-md rounded-2xl p-8">
        {children}
      </div>
    </main>
  );
}
