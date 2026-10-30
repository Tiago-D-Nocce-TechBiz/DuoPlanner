"use client";

import { useState } from "react";
import { Users, CheckCircle2 } from "@/components/ui/icons";

/** Página "Fale Conosco" — formulário simples de contato (abre o e-mail). */
export default function ContatoPage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviado, setEnviado] = useState(false);

  const EMAIL_SUPORTE = "contato@duoplanner.app";

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!mensagem.trim()) return;
    // Abre o cliente de e-mail do usuário com o assunto/corpo preenchidos.
    const assunto = encodeURIComponent(`Fale Conosco — ${nome || "DuoPlanner"}`);
    const corpo = encodeURIComponent(`${mensagem}\n\n— ${nome}${email ? ` (${email})` : ""}`);
    window.location.href = `mailto:${EMAIL_SUPORTE}?subject=${assunto}&body=${corpo}`;
    setEnviado(true);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="nora-surface rounded-3xl border border-[var(--color-border)] p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          <Users className="h-4 w-4" />
          Fale Conosco
        </span>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Precisa de ajuda?
        </h1>
        <p className="mt-3 text-sm sm:text-base leading-relaxed text-[var(--color-muted)]">
          Envie sua dúvida, sugestão ou problema. Respondemos pelo e-mail{" "}
          <a className="font-semibold text-[var(--color-heading)] hover:underline" href={`mailto:${EMAIL_SUPORTE}`}>
            {EMAIL_SUPORTE}
          </a>
          . Para dúvidas rápidas sobre o sistema, a <strong>Nora</strong> também pode ajudar na hora.
        </p>
      </section>

      <form onSubmit={enviar} className="nora-surface rounded-2xl border border-[var(--color-border)] p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
              Seu nome
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como podemos te chamar"
              className="glass-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
              E-mail para resposta
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className="glass-input"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
            Mensagem
          </label>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={5}
            placeholder="Conte o que você precisa…"
            className="glass-input resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={!mensagem.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] disabled:opacity-50 cursor-pointer hover:opacity-90 transition-opacity"
        >
          Enviar mensagem
        </button>
        {enviado && (
          <p className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <CheckCircle2 className="h-4 w-4" />
            Abrimos seu aplicativo de e-mail para enviar. Se não abrir, escreva para {EMAIL_SUPORTE}.
          </p>
        )}
      </form>
    </div>
  );
}
