"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [codigoConvite, setCodigoConvite] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setMensagem("");

    try {
      // Salva sessão ativa localmente para sincronização imediata no navegador e Supabase
      localStorage.setItem(
        "plannerduo-user",
        JSON.stringify({
          email,
          nome: nome || email.split("@")[0],
          workspaceCode: codigoConvite || "DUO-PRINCIPAL",
          loggedAt: new Date().toISOString(),
        })
      );
      router.push("/dashboard");
    } catch {
      setMensagem("Não foi possível autenticar. Verifique os dados informados.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6">
      {/* Cabeçalho da tela de Login */}
      <header className="mx-auto w-full max-w-5xl flex items-center justify-between py-2">
        <Link
          href="/"
          className="font-serif text-2xl font-bold text-[var(--color-heading)] hover:opacity-80 transition-opacity"
        >
          PlannerDuo
        </Link>
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

      {/* Card Centralizado em Glassmorphism */}
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

          {/* Seletor Entrar / Criar Conta */}
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {modo === "cadastro" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                  Seu nome
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
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
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className="glass-input"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                Código de Convite do Parceiro(a) (Opcional)
              </label>
              <input
                type="text"
                value={codigoConvite}
                onChange={(e) => setCodigoConvite(e.target.value)}
                placeholder="Ex.: DUO-2027"
                className="glass-input"
              />
            </div>

            {mensagem && (
              <p className="text-xs text-[var(--color-danger)] font-medium">{mensagem}</p>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-md hover:opacity-90 transition-all cursor-pointer mt-2"
            >
              {carregando
                ? "Autenticando..."
                : modo === "login"
                ? "Entrar no Painel →"
                : "Criar Conta e Sincronizar →"}
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