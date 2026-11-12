"use client";

import { useMemo } from "react";
import { ShieldCheck } from "@/components/ui/icons";
import { formatBRL, toCents } from "@/lib/finance/money";
import { resumirDespesas, useDespesas } from "@/lib/finance/store";
import { useContextoSync } from "@/lib/sync/motor";
import { useOcultos } from "@/lib/ui/use-remocao-adiada";

/** Os três totais do DuoFinance (ilha própria: digitar no formulário não a renderiza). */
export function ResumoFinancas() {
  const despesas = useDespesas();
  const ctx = useContextoSync();
  // Gasto aguardando o "Desfazer" já sai dos totais, como sai da lista.
  const ocultos = useOcultos("despesas");
  const resumo = useMemo(
    () => resumirDespesas(ocultos.size ? despesas.filter((d) => !ocultos.has(d.id)) : despesas, ctx),
    [despesas, ocultos, ctx]
  );
  const brl = (v: number) => formatBRL(toCents(v));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      <div className="glass-panel rounded-2xl p-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total da viagem</span>
        <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(resumo.totalCompartilhado)}</p>
        <span className="mt-1 block text-xs text-[var(--color-muted)]">Compartilhado: visível para os dois</span>
      </div>
      <div className="glass-panel rounded-2xl p-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Sua parte</span>
        <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(resumo.suaParte)}</p>
        <span className="mt-1 block text-xs text-[var(--color-muted)]">{resumo.regra}</span>
      </div>
      <div className="glass-panel rounded-2xl p-6">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Seus gastos pessoais
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
        <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(resumo.totalPrivado)}</p>
        <span className="mt-1 block text-xs text-[var(--color-muted)]">Privado: nunca entra na divisão</span>
      </div>
    </div>
  );
}
