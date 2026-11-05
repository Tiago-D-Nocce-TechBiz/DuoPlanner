"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "@/components/ui/icons";
import { IOF_CAMBIO, MEIOS_PAGAMENTO, compararMeios, type MeioPagamento } from "@/lib/cambio/vet";
import { parseValorMonetario } from "@/lib/finance/importar";

/**
 * "Qual cartão usar?" — compara o custo real (VET) de pagar no exterior com
 * cartão de crédito, conta global ou dinheiro em espécie, usando a cotação
 * que o Conversor está mostrando. Os spreads são estimativas editáveis: cada
 * banco e corretora cobra o seu.
 */

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const vetFmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function QualCartaoUsar({
  taxas,
  moedas,
}: {
  /** 1 unidade da moeda = X reais (cotação comercial). */
  taxas: Record<string, number>;
  moedas: { codigo: string; nome: string }[];
}) {
  const [valor, setValor] = useState("1000");
  const [moeda, setMoeda] = useState(moedas[0]?.codigo ?? "USD");
  const [spreads, setSpreads] = useState<Record<MeioPagamento, string>>(
    () =>
      Object.fromEntries(MEIOS_PAGAMENTO.map((m) => [m.id, String(m.spreadPadrao).replace(".", ",")])) as Record<
        MeioPagamento,
        string
      >
  );

  const comparacao = useMemo(() => {
    const quantia = parseValorMonetario(valor) ?? 0;
    const lidos = Object.fromEntries(
      MEIOS_PAGAMENTO.map((m) => [m.id, parseValorMonetario(spreads[m.id]) ?? m.spreadPadrao])
    ) as Record<MeioPagamento, number>;
    return compararMeios(quantia, taxas[moeda] ?? 0, lidos);
  }, [valor, moeda, spreads, taxas]);

  const [melhor, , pior] = comparacao.resultados;
  const resumoPorId = new Map(MEIOS_PAGAMENTO.map((m) => [m.id, m.resumo]));

  return (
    <section className="glass-panel rounded-2xl p-6" aria-labelledby="titulo-qual-cartao">
      <h2 id="titulo-qual-cartao" className="font-serif text-xl font-bold text-[var(--color-heading)]">
        Qual cartão usar?
      </h2>
      <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)] max-w-2xl">
        Compare o custo real (VET: câmbio + spread + IOF) de pagar no exterior com cartão de crédito, conta global ou dinheiro.
      </p>

      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-end">
        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] sm:w-48">
          Quanto vão gastar
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            className="glass-input mt-1.5 normal-case tracking-normal font-normal"
            placeholder="1.000"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] sm:w-56">
          Moeda
          <select
            value={moeda}
            onChange={(e) => setMoeda(e.target.value)}
            className="glass-input mt-1.5 normal-case tracking-normal font-normal"
          >
            {moedas.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo} · {m.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      {comparacao.resultados.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">Informe um valor e uma cotação maiores que zero.</p>
      ) : (
        <>
          <ul className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {comparacao.resultados.map((r) => {
              const eMelhor = r.id === melhor.id;
              return (
                <li
                  key={r.id}
                  className={`rounded-xl border px-4 py-4 ${
                    eMelhor ? "border-[var(--color-border-strong)] ring-1 ring-[var(--color-border-strong)]" : "border-[var(--color-border)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--color-heading)]">{r.nome}</p>
                    {eMelhor && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent-foreground)]">
                        <CheckCircle2 className="h-3 w-3" />
                        Mais barato
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-serif text-2xl font-bold text-[var(--color-heading)]">{brl(r.totalReais)}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    VET R$ {vetFmt(r.vet)} por 1 {moeda} · {pct(r.percentualExtra)} sobre o comercial
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-muted)] leading-relaxed">{resumoPorId.get(r.id)}</p>
                </li>
              );
            })}
          </ul>

          {pior && comparacao.economiaMaxima > 0 && (
            <p role="status" className="mt-4 text-sm text-[var(--color-heading)]">
              Com <strong>{melhor.nome}</strong>, vocês gastam {brl(comparacao.economiaMaxima)} a menos do que com{" "}
              {pior.nome}.
            </p>
          )}
        </>
      )}

      <details className="mt-4 rounded-xl border border-[var(--color-border)] px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--color-muted)]">
          Ajustar os spreads (cada banco e corretora cobra o seu)
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MEIOS_PAGAMENTO.map((m) => (
            <label key={m.id} className="text-xs text-[var(--color-muted)]">
              {m.nome} (%)
              <input
                value={spreads[m.id]}
                onChange={(e) => setSpreads((s) => ({ ...s, [m.id]: e.target.value }))}
                inputMode="decimal"
                aria-label={`Spread de ${m.nome} em porcentagem`}
                className="glass-input mt-1"
              />
            </label>
          ))}
        </div>
      </details>

      <p className="mt-3 text-[11px] text-[var(--color-muted)] leading-relaxed">
        Estimativa com a cotação comercial mostrada acima e IOF de {pct(IOF_CAMBIO * 100)}, que em 2026 vale para os três meios. Antes de
        fechar, peça o VET ao banco ou à casa de câmbio: ele já inclui tarifas e impostos.
      </p>
    </section>
  );
}
