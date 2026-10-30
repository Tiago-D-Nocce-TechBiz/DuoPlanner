import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata = { title: "Entrar — DuoPlanner" };

/** Tela de acesso (Entrar). */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen modoInicial="login" />
    </Suspense>
  );
}
