"use client";

import { percentualTexto, reais, type ResumoDeCustos } from "@/lib/ai/cost-agent-metrics";
import { isoToBR } from "@/lib/dates";

/**
 * Painel de custos do card da Nora: os números que o app calculou (não a IA),
 * em blocos fáceis de bater o olho. Carregado sob demanda pelo card, só
 * quando a ferramenta de gestão de custos devolve um resultado.
 */
function Bloco({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] px-2.5 py-2">
      <dt className="text-[10px] font-medium text-[var(--color-muted)]">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-bold text-[var(--color-heading)]">{valor}</dd>
      <dd className="text-[10px] text-[var(--color-muted)]">{nota}</dd>
    </div>
  );
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function PainelDeCustos({ custos: c }: { custos: ResumoDeCustos }) {
  const categorias = c.porCategoria.slice(0, 5);
  return (
    <section data-nora-custos aria-label="Resumo de custos do casal" className="space-y-3">
      <dl className="grid grid-cols-2 gap-2">
        <Bloco rotulo="Gasto compartilhado" valor={reais(c.totalCentavos)} nota={plural(c.quantidade, "lançamento", "lançamentos")} />
        <Bloco
          rotulo="Média por dia"
          valor={c.periodo ? reais(c.mediaDiariaCentavos) : "—"}
          nota={c.periodo ? `${isoToBR(c.periodo.inicio)} a ${isoToBR(c.periodo.fim)}` : "sem datas"}
        />
        <Bloco rotulo="Parcelas a pagar" valor={reais(c.parcelas.restantesCentavos)} nota={plural(c.parcelas.abertas, "parcela restante", "parcelas restantes")} />
        <Bloco
          rotulo="Roteiro a lançar"
          valor={reais(c.roteiro.aLancarCentavos)}
          nota={c.roteiro.itensComCusto > 0 ? `de ${reais(c.roteiro.estimadoCentavos)} estimados` : "sem custos estimados"}
        />
      </dl>

      <p data-nora-previsao className="rounded-lg bg-blue-500/5 px-3 py-2 text-xs">
        <span className="text-[var(--color-muted)]">Previsão comprometida (gasto + parcelas + Roteiro a lançar): </span>
        <strong className="text-[var(--color-heading)]">{reais(c.previsaoCentavos)}</strong>
      </p>

      {categorias.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">Onde o dinheiro foi</h4>
          <ul className="space-y-2">
            {categorias.map((k) => (
              <li key={k.categoria}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-[var(--color-heading)]">{k.categoria}</span>
                  <span className="shrink-0 text-[var(--color-muted)]">
                    {reais(k.centavos)} · {percentualTexto(k.permil)}
                  </span>
                </div>
                <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(2, k.permil / 10))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
