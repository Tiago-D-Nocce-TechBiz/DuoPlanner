import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { loginAction } from "../actions";

export const metadata = { title: "Entrar — PlannerDuo" };

/** Página de início de sessão. */
export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-3xl font-semibold text-heading">
          Bem-vindo de volta
        </h1>
        <p className="text-sm text-foreground">
          Entre para continuar a planejar.
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
          label="Senha"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
        <Button type="submit" variant="primary" className="w-full">
          Entrar
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/registo" className="font-medium text-accent hover:text-accent-hover">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
