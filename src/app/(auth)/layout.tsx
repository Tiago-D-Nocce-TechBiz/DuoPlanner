import { Logo } from "@/components/ui/logo";

/**
 * Layout partilhado das páginas de autenticação (login e registo).
 * Centraliza o cartão num fundo escuro com brilho subtil de destaque.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative mb-8">
        <Logo />
      </div>
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        {children}
      </div>
    </main>
  );
}
