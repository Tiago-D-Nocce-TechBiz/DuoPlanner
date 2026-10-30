import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata = { title: "Criar conta — DuoPlanner" };

/** Tela de acesso (Criar conta). Mantida por compatibilidade de rota. */
export default function RegistoPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen modoInicial="cadastro" />
    </Suspense>
  );
}
