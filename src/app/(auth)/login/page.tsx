import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { loginAction } from "../actions";

export const metadata = { title: "Iniciar sessão — PlannerDuo" };

/** Página de início de sessão. */
export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-2xl font-bold text-zinc-50">
          Bem-vindo de volta
        </h1>
        <p className="text-sm text-zinc-400">
          Inicie sessão para continuar a planear.
        </p>
      </div>

      <form action={loginAction} className="space-y-4">
        <Field
          id="email"
          label="E-mail"
          type="email"
          placeholder="voce@exemplo.com"
          autoComplete="email"
          required
        />
        <Field
          id="password"
          label="Palavra-passe"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
        <Button type="submit" variant="primary" className="w-full">
          Iniciar sessão
        </Button>
      </form>

      <p className="text-center text-sm text-zinc-400">
        Ainda não tem conta?{" "}
        <Link href="/registo" className="font-medium text-accent hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
