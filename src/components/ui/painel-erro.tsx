"use client";

import { useEffect } from "react";
import { emProducao } from "@/lib/env/modo";
import { codigoDoErro } from "@/lib/erros/codigo";

/**
 * Conteúdo dos error boundaries do App Router (`error.tsx`), em PT-BR.
 *
 * Nunca mostra a mensagem técnica em produção: erros do servidor já chegam
 * genéricos, com um `digest` que casa com o log; erros do navegador podem
 * trazer detalhes internos. O código (digest) aparece para o suporte. Em
 * desenvolvimento, a mensagem fica num bloco recolhido para quem programa.
 *
 * Os boundaries vão no carregamento de todas as rotas, então este módulo é
 * mínimo: ícone SVG próprio (sem o conjunto inteiro de `ui/icons`) e `<a>`
 * comum em vez de `next/link`. Depois de um erro, a navegação completa é a
 * desejada: descarta o estado da tela que quebrou.
 */

function IconeAlerta() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5z" />
      <path d="M12 10v4.2" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

export function PainelErro({
  error,
  retry,
  titulo,
  descricao,
  destino,
}: {
  error: unknown;
  retry: () => void;
  titulo: string;
  descricao: string;
  destino: { href: string; rotulo: string };
}) {
  useEffect(() => {
    console.error("[erro na tela]", error);
  }, [error]);

  const codigo = codigoDoErro(error);
  const detalhe = !emProducao && error instanceof Error ? error.message : null;

  return (
    <div role="alert" className="glass-panel mx-auto max-w-lg rounded-2xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-border)] text-[var(--color-heading)]">
        <IconeAlerta />
      </div>
      <h1 className="font-serif text-2xl font-bold text-[var(--color-heading)]">{titulo}</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{descricao}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
        >
          Tentar de novo
        </button>
        {/* Navegação completa de propósito (descarta o estado que quebrou). */}
        <a href={destino.href} className="px-4 py-2.5 rounded-xl text-xs font-semibold glass-panel">
          {destino.rotulo}
        </a>
      </div>
      {codigo && <p className="mt-5 text-[11px] text-[var(--color-subtle)]">Código do erro: {codigo}</p>}
      {detalhe && (
        <details className="mt-4 text-left text-[11px] text-[var(--color-subtle)]">
          <summary className="cursor-pointer">Detalhe técnico (só em desenvolvimento)</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{detalhe}</pre>
        </details>
      )}
    </div>
  );
}
