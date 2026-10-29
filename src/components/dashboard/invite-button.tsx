"use client";

import { useState, useTransition } from "react";
import { gerarConvite } from "@/app/dashboard/workspace-actions";

/**
 * Botão "Convidar Parceiro(a)" que gera um convite REAL no Supabase e exibe o
 * link pronto para copiar. Abre um modal em glassmorphism, 100% em PT-BR.
 */
export function InviteButton({
  className = "",
}: {
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [copiado, setCopiado] = useState(false);

  function gerar() {
    setMensagem("");
    setLink("");
    startTransition(async () => {
      const res = await gerarConvite(email);
      setMensagem(res.mensagem);
      if (res.ok && res.link) setLink(res.link);
    });
  }

  function copiar() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={
          className ||
          "px-3.5 py-1.5 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
        }
      >
        + Convidar Parceiro(a)
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 max-w-md w-full">
            <h3 className="font-serif text-xl font-bold text-[var(--color-heading)]">
              Convidar para o planejamento compartilhado
            </h3>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Gere um link exclusivo e envie para quem vai viajar com você. Apenas
              os gastos marcados como <strong>Gasto da Viagem (Compartilhado)</strong>{" "}
              ficam visíveis entre as duas contas.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                E-mail da pessoa convidada (opcional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parceiro@email.com.br"
                className="glass-input"
              />
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={gerar}
                disabled={pendente}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
              >
                {pendente ? "Gerando convite…" : "Gerar link de convite"}
              </button>
            </div>

            {link && (
              <div className="mt-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                  Link de convite
                </label>
                <input type="text" readOnly value={link} className="glass-input text-xs" />
              </div>
            )}

            {mensagem && (
              <p className="mt-3 text-xs text-[var(--color-muted)]">{mensagem}</p>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold glass-panel cursor-pointer"
              >
                Fechar
              </button>
              {link && (
                <button
                  type="button"
                  onClick={copiar}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
                >
                  {copiado ? "✓ Link copiado!" : "Copiar link"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
