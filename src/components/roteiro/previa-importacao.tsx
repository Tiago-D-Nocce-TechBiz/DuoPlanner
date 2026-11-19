"use client";

import { CheckCircle2, Sparkles } from "@/components/ui/icons";
import { formatarDataDoDia, formatarReais } from "@/lib/roteiro/apresentacao";
import type { DiaPrevisto, ItemPrevisto } from "@/lib/roteiro/organizar";
import { ROTULO_TURNO } from "@/lib/roteiro/tipos";
import { cn } from "@/lib/utils";

/**
 * Prévia dia a dia da importação. As atividades da planilha já vêm marcadas
 * (as que já estão no roteiro aparecem desmarcadas e travadas); as sugestões
 * da Nora esperam a decisão: "Incluir no Roteiro" ou "Ignorar".
 */

function Selos({ item }: { item: ItemPrevisto }) {
  const slot = item.horario || (item.turno ? ROTULO_TURNO[item.turno] : "");
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
      {slot && <span className="rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5">{slot}</span>}
      <span className="rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5">{item.categoria}</span>
      {item.custo !== null && (
        <span className="rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5">{item.custo === 0 ? "Grátis" : formatarReais(item.custo)}</span>
      )}
    </span>
  );
}

export function DiaDaPrevia({
  dia,
  numero,
  selecionados,
  ignoradas,
  onAlternar,
  onIgnorar,
}: {
  dia: DiaPrevisto;
  numero: number;
  selecionados: ReadonlySet<string>;
  ignoradas: ReadonlySet<string>;
  onAlternar: (chave: string) => void;
  onIgnorar: (chave: string) => void;
}) {
  const sugestoes = dia.sugestoes.filter((s) => !s.jaNoRoteiro && !ignoradas.has(s.chave));
  return (
    <section data-dia-previa aria-label={`Dia ${numero} da prévia`} className="rounded-xl border border-[var(--color-border)] p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--color-heading)]">
          <span className="font-serif text-[var(--color-subtle)]">{String(numero).padStart(2, "0")}</span>{" "}
          {formatarDataDoDia(dia.data)}
          {dia.destino && <span className="font-normal text-[var(--color-muted)]"> · {dia.destino}</span>}
        </h3>
        {dia.diaExistenteId && <span className="text-[11px] text-[var(--color-muted)]">entra num dia que já existe no roteiro</span>}
      </header>

      <ul className="space-y-1.5">
        {dia.itens.map((i) => (
          <li key={i.chave}>
            <label
              className={cn(
                "flex items-start gap-2.5 rounded-lg px-2 py-1.5",
                i.jaNoRoteiro ? "opacity-60" : "cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
              )}
            >
              <input
                type="checkbox"
                checked={!i.jaNoRoteiro && selecionados.has(i.chave)}
                disabled={i.jaNoRoteiro}
                onChange={() => onAlternar(i.chave)}
                aria-label={i.titulo}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-[var(--color-heading)]">{i.titulo}</span>
                <Selos item={i} />
                {i.nota && <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{i.nota}</span>}
              </span>
              {i.jaNoRoteiro && (
                <span className="shrink-0 text-[11px] font-medium text-[var(--color-muted)]">Já está no roteiro</span>
              )}
            </label>
          </li>
        ))}
      </ul>

      {sugestoes.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3" data-sugestoes-nora>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            Sugestões da Nora
          </p>
          {sugestoes.map((s) => {
            const incluida = selecionados.has(s.chave);
            return (
              <article
                key={s.chave}
                data-sugestao-nora
                className="rounded-lg border border-blue-400/30 bg-blue-500/5 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-heading)]">{s.titulo}</p>
                    <Selos item={s} />
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      aria-pressed={incluida}
                      onClick={() => onAlternar(s.chave)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold cursor-pointer",
                        incluida
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                      )}
                    >
                      {incluida && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {incluida ? "Incluída" : "Incluir no Roteiro"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onIgnorar(s.chave)}
                      className="rounded-full px-3 py-1 text-xs font-medium text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
                {s.porque && <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">{s.porque}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
