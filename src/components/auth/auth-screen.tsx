"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/logo";
import { loginAction, cadastroAction } from "@/app/(auth)/actions";

/**
 * Tela de acesso real (Supabase Auth), reutilizada por /login e /cadastro
 * (/registo redireciona com 308). Alterna entre Entrar e Criar conta, com
 * suporte a código de convite para vincular a conta ao espaço da dupla.
 * Interface 100% em Português do Brasil.
 */
export function AuthScreen({
  modoInicial = "login",
}: {
  modoInicial?: "login" | "cadastro";
}) {
  const params = useSearchParams();
  // Só "?convite=": o "?code=" que o Supabase acrescenta ao confirmar o e-mail
  // é um código de sessão, não de convite.
  const conviteUrl = params.get("convite") ?? "";
  // Destino pedido pelo proxy (/login?redirect=/dashboard/...); o servidor valida.
  const redirectUrl = params.get("redirect") ?? "";
  const emailConfirmado = params.get("confirmado") === "1";

  // Com convite na URL, a aba inicial é "cadastro" (salvo se o e-mail acabou de
  // ser confirmado: aí a conta já existe). Calculado no estado inicial, sem
  // efeito de sincronização.
  const [modo, setModo] = useState<"login" | "cadastro">(
    emailConfirmado ? "login" : conviteUrl ? "cadastro" : modoInicial
  );

  // Sucesso redireciona; o estado só guarda a falha (ou o aviso do cadastro).
  const [estadoLogin, submitLogin, loginPendente] = useActionState(loginAction, null);
  const [estadoCadastro, submitCadastro, cadastroPendente] = useActionState(cadastroAction, null);

  const carregando = loginPendente || cadastroPendente;
  const estado = modo === "login" ? estadoLogin : estadoCadastro;
  const mensagem = estado && !estado.success ? estado.error : undefined;
  // Aviso neutro (ex.: "confirme o e-mail"): não é erro, não vai em vermelho.
  const aviso = modo === "cadastro" && estadoCadastro?.success ? estadoCadastro.data.aviso : undefined;

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6">
      <header className="mx-auto w-full max-w-5xl flex items-center justify-between py-2">
        <BrandLogo href="/" />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/"
            className="text-xs sm:text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-heading)]"
          >
            ← Voltar ao início
          </Link>
        </div>
      </header>

      <main className="my-auto mx-auto w-full max-w-md py-8">
        <div className="glass-panel rounded-3xl p-7 sm:p-9">
          <div className="text-center mb-6">
            <h1 className="font-serif text-3xl font-bold text-[var(--color-heading)]">
              {modo === "login" ? "Bem-vindo de volta" : "Criar sua conta"}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Acesse seu painel compartilhado de viagens e finanças.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/5 dark:bg-white/5 mb-6">
            <button
              type="button"
              onClick={() => setModo("login")}
              className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                modo === "login"
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-sm"
                  : "text-[var(--color-muted)]"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setModo("cadastro")}
              className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                modo === "cadastro"
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-sm"
                  : "text-[var(--color-muted)]"
              }`}
            >
              Criar conta / Convite
            </button>
          </div>

          {modo === "login" && (emailConfirmado || conviteUrl) && (
            <p role="status" className="mb-4 text-xs text-[var(--color-muted)] text-center">
              {emailConfirmado ? "E-mail confirmado! Entre para continuar." : null}
              {emailConfirmado && conviteUrl ? " " : null}
              {conviteUrl ? "Ao entrar, o convite do seu parceiro(a) será aplicado." : null}
            </p>
          )}

          <form action={modo === "login" ? submitLogin : submitCadastro} className="space-y-4">
            {modo === "login" && conviteUrl && (
              <input type="hidden" name="codigoConvite" value={conviteUrl} />
            )}
            {modo === "login" && redirectUrl && (
              <input type="hidden" name="redirect" value={redirectUrl} />
            )}
            {modo === "cadastro" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                  Seu nome
                </label>
                <input
                  type="text"
                  name="nome"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Ex.: Tiago"
                  className="glass-input"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                name="email"
                required
                maxLength={254}
                autoComplete="email"
                inputMode="email"
                placeholder="seu@email.com.br"
                className="glass-input"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                Senha
              </label>
              <input
                type="password"
                name="senha"
                required
                minLength={modo === "cadastro" ? 8 : undefined}
                maxLength={72}
                autoComplete={modo === "cadastro" ? "new-password" : "current-password"}
                placeholder="••••••••"
                className="glass-input"
              />
              {modo === "cadastro" && (
                <p className="mt-1 text-[11px] text-[var(--color-subtle)]">
                  Mínimo de 8 caracteres, com letra e número.
                </p>
              )}
            </div>

            {modo === "cadastro" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                  Código de convite do parceiro(a) (opcional)
                </label>
                <input
                  type="text"
                  name="codigoConvite"
                  defaultValue={conviteUrl}
                  placeholder="Ex.: DUO-2027"
                  className="glass-input"
                />
              </div>
            )}

            {mensagem && (
              <p role="alert" className="text-xs text-[var(--color-danger)] font-medium">{mensagem}</p>
            )}
            {aviso && (
              <p role="status" className="rounded-xl border border-[var(--color-border-strong)] px-3 py-2.5 text-xs text-[var(--color-heading)]">
                {aviso}
              </p>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-md hover:opacity-90 transition-all cursor-pointer mt-2 disabled:opacity-60"
            >
              {carregando
                ? "Processando..."
                : modo === "login"
                ? "Entrar no painel →"
                : "Criar conta →"}
            </button>
          </form>
        </div>
      </main>

      <footer className="text-center text-xs text-[var(--color-muted)] py-2">
        Protegido sob as diretrizes da{" "}
        <Link href="/termos" className="underline hover:text-[var(--color-heading)]">
          LGPD (Lei nº 13.709/2018)
        </Link>
      </footer>
    </div>
  );
}
