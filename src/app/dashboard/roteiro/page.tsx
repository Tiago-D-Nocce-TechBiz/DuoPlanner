"use client";

import { useMemo } from "react";
import { Map as IconeMapa } from "@/components/ui/icons";
import type { RoteiroDia, RoteiroItem } from "@/lib/sync/modelos";
import {
  atualizarRegistro,
  criarRegistro,
  removerRegistro,
  useContextoSync,
  useRegistros,
} from "@/lib/sync/motor";

/**
 * Roteiro do casal — dias e atividades sincronizados (Postgres + Realtime).
 *
 * O que um muda aparece para o outro na hora; offline, a última cópia fica no
 * aparelho e as alterações sobem quando a conexão voltar. Cada tecla vira uma
 * única atualização na fila (as edições ainda não enviadas se combinam).
 */

function formatarData(iso: string | null): string {
  if (!iso) return "Dia sem data";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const proximaOrdem = (lista: { ordem: number }[]) => lista.reduce((max, x) => Math.max(max, x.ordem), -1) + 1;

export default function RoteiroPage() {
  const dias = useRegistros("roteiro_dias");
  const itens = useRegistros("roteiro_itens");
  const ctx = useContextoSync();
  const ws = ctx?.workspace?.id ?? null;

  const diasOrdenados = useMemo(
    () => [...dias].sort((a, b) => a.ordem - b.ordem || (a.data ?? "").localeCompare(b.data ?? "")),
    [dias]
  );
  const itensPorDia = useMemo(() => {
    const mapa = new Map<string, RoteiroItem[]>();
    for (const item of itens) {
      if (!item.diaId) continue;
      mapa.set(item.diaId, [...(mapa.get(item.diaId) ?? []), item]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.ordem - b.ordem);
    return mapa;
  }, [itens]);

  const agora = () => new Date().toISOString();

  const adicionarDia = () => {
    if (!ctx || !ws) return;
    const dia: RoteiroDia = {
      id: crypto.randomUUID(),
      workspaceId: ws,
      userId: ctx.userId,
      data: null,
      ordem: proximaOrdem(dias),
      atualizadoEm: agora(),
      atualizadoPor: ctx.userId,
    };
    criarRegistro("roteiro_dias", dia);
  };

  const removerDia = (id: string) => {
    // Itens antes do dia: atividades ainda não enviadas desse dia nem saem.
    for (const item of itensPorDia.get(id) ?? []) removerRegistro("roteiro_itens", item.id);
    removerRegistro("roteiro_dias", id);
  };

  const adicionarItem = (diaId: string) => {
    if (!ctx || !ws) return;
    const item: RoteiroItem = {
      id: crypto.randomUUID(),
      workspaceId: ws,
      diaId,
      horario: "",
      titulo: "",
      nota: "",
      ordem: proximaOrdem(itensPorDia.get(diaId) ?? []),
      atualizadoEm: agora(),
      atualizadoPor: ctx.userId,
    };
    criarRegistro("roteiro_itens", item);
  };

  const semEspaco = !ws;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">Roteiro</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Organizem a viagem dia a dia, juntos e em tempo real.</p>
        </div>
        <button
          type="button"
          onClick={adicionarDia}
          disabled={semEspaco}
          className="self-start sm:self-auto px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
        >
          + Adicionar dia
        </button>
      </div>

      {diasOrdenados.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10 text-[var(--color-heading)]">
            <IconeMapa className="h-6 w-6" />
          </div>
          <h2 className="font-serif text-2xl font-semibold text-[var(--color-heading)]">Ainda sem roteiro</h2>
          <p className="mt-2 max-w-sm mx-auto text-sm text-[var(--color-muted)]">
            {semEspaco
              ? "Preparando o espaço do casal…"
              : "Crie o primeiro dia da viagem e comece a adicionar atividades, reservas e anotações."}
          </p>
          <button
            type="button"
            onClick={adicionarDia}
            disabled={semEspaco}
            className="mt-6 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
          >
            + Adicionar dia
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {diasOrdenados.map((dia, idx) => (
            <section key={dia.id} className="glass-panel rounded-2xl p-6" aria-label={`Dia ${idx + 1}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <span className="font-serif text-2xl font-bold text-[var(--color-subtle)]">{String(idx + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{formatarData(dia.data)}</p>
                    <input
                      type="date"
                      aria-label={`Data do dia ${idx + 1}`}
                      value={dia.data ?? ""}
                      onChange={(e) => atualizarRegistro("roteiro_dias", dia.id, { data: e.target.value || null })}
                      className="glass-input mt-1 max-w-[180px]"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removerDia(dia.id)}
                  className="self-start px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                >
                  Remover dia
                </button>
              </div>

              <div className="space-y-2.5">
                {(itensPorDia.get(dia.id) ?? []).map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--color-border)] p-3 grid grid-cols-1 sm:grid-cols-[100px_1fr_1fr_auto] gap-2.5 items-center">
                    <input
                      type="time"
                      aria-label="Horário"
                      value={item.horario}
                      onChange={(e) => atualizarRegistro("roteiro_itens", item.id, { horario: e.target.value })}
                      className="glass-input"
                    />
                    <input
                      type="text"
                      aria-label="Atividade"
                      placeholder="Atividade (ex.: passeio de barco)"
                      value={item.titulo}
                      maxLength={120}
                      onChange={(e) => atualizarRegistro("roteiro_itens", item.id, { titulo: e.target.value })}
                      className="glass-input"
                    />
                    <input
                      type="text"
                      aria-label="Nota ou reserva"
                      placeholder="Nota / reserva (opcional)"
                      value={item.nota}
                      maxLength={500}
                      onChange={(e) => atualizarRegistro("roteiro_itens", item.id, { nota: e.target.value })}
                      className="glass-input"
                    />
                    <button
                      type="button"
                      onClick={() => removerRegistro("roteiro_itens", item.id)}
                      aria-label="Remover atividade"
                      className="justify-self-end px-2.5 py-2 rounded-lg text-xs text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => adicionarItem(dia.id)}
                className="mt-3 px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                + Adicionar atividade
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
