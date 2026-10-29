import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { registerAction } from "../actions";

export const metadata = { title: "Criar conta — PlannerDuo" };

/** Página de registo de nova conta. */
export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-3xl font-semibold text-heading">
          Crie a sua conta
        </h1>
        <p className="text-sm text-foreground">
          Gratuito, para sempre. Comece a planejar em minutos.
        </p>
      </div>

      <form action={registerAction} className="space-y-4">
        <Field
          id="name"
          label="Nome"
          placeholder="O seu nome"
          autoComplete="name"
          required
        />
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
          placeholder="Crie uma senha"
          autoComplete="new-password"
          required
        />
        <Button type="submit" variant="primary" className="w-full">
          Criar conta gratuita
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
          Entrar
        </Link>
      </p>
    </div>
  );
}
