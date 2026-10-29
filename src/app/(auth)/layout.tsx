import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";

/**
 * Layout partilhado das páginas de autenticação (login e registo).
 * Card zinc-900 centralizado sobre o fundo zinc-950.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="w-full max-w-md p-8">{children}</Card>
    </main>
  );
}
