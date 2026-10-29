"use client";

import { useState } from "react";

/**
 * Roteiro funcional — organiza a viagem em dias, cada um com itens
 * (horário + atividade + nota). Estado local no cliente (pronto para, depois,
 * persistir no Supabase via a tabela `roteiro_itens`). 100% em PT-BR.
 */

interface ItemRoteiro {
  id: string;
  horario: string;
  titulo: string;
  nota: string;
}

interface DiaRoteiro {
  id: string;
  data: string; // ISO yyyy-mm-dd (opcional)
  itens: ItemRoteiro[];
}

const novoId = () => Math.random().toString(36).substring(2, 9);

function formatarData(iso: string): string {
  if (!iso) return "Dia sem data";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function RoteiroPage() {
  const [dias, setDias] = useState<DiaRoteiro[]>([]);

  const adicionarDia = () =>
    setDias((prev) => [...prev, { id: novoId(), data: "", itens: [] }]);

  const removerDia = (id: string) =>
    setDias((prev) => prev.filter((d) => d.id !== id));

  const atualizarData = (id: string, data: string) =>
    setDias((prev) => prev.map((d) => (d.id === id ? { ...d, data } : d)));

  const adicionarItem = (diaId: string) =>
    setDias((prev) =>
      prev.map((d) =>
        d.id === diaId
          ? { ...d, itens: [...d.itens, { id: novoId(), horario: "", titulo: "", nota: "" }] }
          : d
      )
    );

  const atualizarItem = (diaId: string, itemId: string, campo: keyof ItemRoteiro, valor: string) =>
    setDias((prev) =>
      prev.map((d) =>
        d.id === diaId
          ? { ...d, itens: d.itens.map((it) => (it.id === itemId ? { ...it, [campo]: valor } : it)) }
          : d
      )
    );

  const removerItem = (diaId: string, itemId: string) =>
    setDias((prev) =>
      prev.map((d) =>
        d.id === diaId ? { ...d, itens: d.itens.filter((it) => it.id !== itemId) } : d
      )
    );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">Roteiro</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Organize a viagem dia a dia, a dois.</p>
        </div>
        <button
          type="button"
          onClick={adicionarDia}
          className="self-start sm:self-auto px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
        >
          + Adicionar dia
        </button>
      </div>

      {dias.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10 text-xl">
            🗓️
          </div>
          <h2 className="font-serif text-2xl font-semibold text-[var(--color-heading)]">Ainda sem roteiro</h2>
          <p className="mt-2 max-w-sm mx-auto text-sm text-[var(--color-muted)]">
            Crie o primeiro dia da viagem e comece a adicionar atividades, reservas e anotações.
          </p>
          <button
            type="button"
            onClick={adicionarDia}
            className="mt-6 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
          >
            + Adicionar dia
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {dias.map((dia, idx) => (
            <div key={dia.id} className="glass-panel rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <span className="font-serif text-2xl font-bold text-[var(--color-subtle)]">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                      {formatarData(dia.data)}
                    </p>
                    <input
                      type="date"
                      value={dia.data}
                      onChange={(e) => atualizarData(dia.id, e.target.value)}
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
                {dia.itens.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--color-border)] p-3 grid grid-cols-1 sm:grid-cols-[90px_1fr_1fr_auto] gap-2.5 items-center">
                    <input
                      type="time"
                      value={item.horario}
                      onChange={(e) => atualizarItem(dia.id, item.id, "horario", e.target.value)}
                      className="glass-input"
                    />
                    <input
                      type="text"
                      placeholder="Atividade (ex.: passeio de barco)"
                      value={item.titulo}
                      onChange={(e) => atualizarItem(dia.id, item.id, "titulo", e.target.value)}
                      className="glass-input"
                    />
                    <input
                      type="text"
                      placeholder="Nota / reserva (opcional)"
                      value={item.nota}
                      onChange={(e) => atualizarItem(dia.id, item.id, "nota", e.target.value)}
                      className="glass-input"
                    />
                    <button
                      type="button"
                      onClick={() => removerItem(dia.id, item.id)}
                      aria-label="Remover item"
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
