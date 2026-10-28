import { Logo } from "@/components/ui/logo";

/**
 * Layout partilhado das páginas de autenticação (login e registo).
 * Cartão glass centralizado sobre o fundo Alabaster com gradientes de areia.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="relative mb-8">
        <Logo />
      </div>
      <div className="glass-surface relative w-full max-w-md rounded-2xl p-8">
        {children}
      </div>
    </main>
  );
}
