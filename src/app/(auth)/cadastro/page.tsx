import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata = { title: "Criar conta — DuoPlanner" };

/** Tela de acesso (Criar conta) — rota /cadastro. */
export default function CadastroPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen modoInicial="cadastro" />
    </Suspense>
  );
}
