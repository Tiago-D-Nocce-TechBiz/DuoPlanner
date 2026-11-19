"use client";

import { memo, useMemo, useState } from "react";
import { Map as IconeMapa, Sparkles } from "@/components/ui/icons";
import { ToastDesfazer } from "@/components/ui/toast-desfazer";
import {
  categoriaDoItem,
  custoEstimadoDoDia,
  formatarDataDoDia,
  formatarReais,
  lerCustoDigitado,
  ordenarDias,
  passaNoFiltro,
} from "@/lib/roteiro/apresentacao";
import { CATEGORIAS_ROTEIRO, FILTROS_ROTEIRO, ROTULO_TURNO, TURNOS_ROTEIRO, type FiltroRoteiro, type TurnoRoteiro } from "@/lib/roteiro/tipos";
import type { RoteiroDia, RoteiroItem } from "@/lib/sync/modelos";
import { atualizarRegistro, getRegistros, removerRegistro, useContextoSync, useRegistros } from "@/lib/sync/motor";
import { DURACAO_DESFAZER_MS, useRemocaoAdiada } from "@/lib/ui/use-remocao-adiada";
import { adicionarAtividade, adicionarDia } from "./roteiro-acoes";

/**
 * Roteiro do casal — dias e atividades sincronizados (Postgres + Realtime).
 *
 * O que um muda aparece para o outro na hora; offline, a última cópia fica no
 * aparelho e as alterações sobem quando a conexão voltar. Cada tecla vira uma
 * única atualização na fila (as edições ainda não enviadas se combinam; o
 * envio espera 700 ms de pausa e o disco também é gravado com atraso).
 * Remover um dia ou uma atividade tem "Desfazer" por 5 s.
 *
 * Os dias aparecem em ordem cronológica (sem data por último), cada um com
 * data, destino e o custo estimado do dia, e dá para filtrar as atividades
 * por categoria.
 *
 * Desempenho ao digitar: dias e atividades são memoizados. O motor mantém o
 * mesmo objeto para o que não mudou, então uma tecla redesenha só a linha
 * editada, não o roteiro inteiro (com dezenas de dias, era o que travava a
 * digitação no celular).
 */

/** O que está aguardando o prazo do "Desfazer". */
type Remocao = { id: string; tipo: "dia" | "atividade"; mensagem: string };

/** Remove o dia e as atividades dele (lidas na hora: inclui as que o par acabou de criar). */
function removerDiaComAtividades(diaId: string) {
  // Itens antes do dia: atividades ainda não enviadas desse dia nem saem.
  for (const item of getRegistros("roteiro_itens")) {
    if (item.diaId === diaId) removerRegistro("roteiro_itens", item.id);
  }
  removerRegistro("roteiro_dias", diaId);
}

function efetivarRemocao(r: Remocao) {
  if (r.tipo === "dia") removerDiaComAtividades(r.id);
  else removerRegistro("roteiro_itens", r.id);
}

const mesmosItens = (a: readonly RoteiroItem[], b: readonly RoteiroItem[]) =>
  a.length === b.length && a.every((item, i) => item === b[i]);

const SEM_ITENS: RoteiroItem[] = [];

export function ListaDoRoteiro() {
  const dias = useRegistros("roteiro_dias");
  const itens = useRegistros("roteiro_itens");
  const ctx = useContextoSync();
  const ws = ctx?.workspace?.id ?? null;
  const userId = ctx?.userId ?? null;
  const remocao = useRemocaoAdiada<Remocao>("roteiro", efetivarRemocao);
  const oculto = remocao.pendente?.id ?? null;
  const [filtro, setFiltro] = useState<FiltroRoteiro>("Todos");

  const diasOrdenados = useMemo(() => ordenarDias(dias.filter((d) => d.id !== oculto)), [dias, oculto]);

  const itensPorDia = useMemo(() => {
    const mapa = new Map<string, RoteiroItem[]>();
    for (const item of itens) {
      if (!item.diaId || item.id === oculto) continue;
      mapa.set(item.diaId, [...(mapa.get(item.diaId) ?? []), item]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.ordem - b.ordem);
    return mapa;
  }, [itens, oculto]);

  const semEspaco = !ws;
  const filtrando = filtro !== "Todos";
  const diasVisiveis = filtrando
    ? diasOrdenados.filter((d) => (itensPorDia.get(d.id) ?? SEM_ITENS).some((i) => passaNoFiltro(i, filtro)))
    : diasOrdenados;

  return (
    <div className="space-y-6">
      {diasOrdenados.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10 text-[var(--color-heading)]">
            <IconeMapa className="h-6 w-6" />
          </div>
          <h2 className="font-serif text-2xl font-semibold text-[var(--color-heading)]">Ainda sem roteiro</h2>
          <p className="mt-2 max-w-sm mx-auto text-sm text-[var(--color-muted)]">
            {semEspaco
              ? "Preparando o espaço do casal…"
              : "Crie o primeiro dia da viagem ou importe uma planilha, e comece a adicionar atividades, reservas e anotações."}
          </p>
          <button
            type="button"
            onClick={() => userId && ws && adicionarDia(userId, ws)}
            disabled={semEspaco}
            className="mt-6 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
          >
            + Adicionar dia
          </button>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Filtrar atividades por categoria" className="flex flex-wrap gap-2">
            {FILTROS_ROTEIRO.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                className={
                  filtro === f
                    ? "px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
                    : "px-3.5 py-1.5 rounded-full text-xs font-medium glass-panel text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                }
              >
                {f}
              </button>
            ))}
          </div>
          {diasVisiveis.length === 0 ? (
            <p className="glass-panel rounded-2xl p-8 text-center text-sm text-[var(--color-muted)]">
              Nenhuma atividade da categoria “{filtro}” no roteiro.
            </p>
          ) : (
            <div className="space-y-6">
              {diasVisiveis.map((dia) => {
                const todos = itensPorDia.get(dia.id) ?? SEM_ITENS;
                return (
                  <DiaDoRoteiro
                    key={dia.id}
                    dia={dia}
                    numero={diasOrdenados.indexOf(dia) + 1}
                    itens={filtrando ? todos.filter((i) => passaNoFiltro(i, filtro)) : todos}
                    totalDeAtividades={todos.length}
                    custoDoDia={custoEstimadoDoDia(todos)}
                    userId={userId}
                    ws={ws}
                    onRemover={remocao.remover}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
      {remocao.pendente && (
        <ToastDesfazer
          key={remocao.pendente.id}
          mensagem={remocao.pendente.mensagem}
          duracaoMs={DURACAO_DESFAZER_MS}
          onDesfazer={remocao.desfazer}
          onFechar={remocao.confirmar}
        />
      )}
    </div>
  );
}

interface PropsDia {
  dia: RoteiroDia;
  numero: number;
  /** As atividades que passam no filtro. */
  itens: RoteiroItem[];
  totalDeAtividades: number;
  custoDoDia: number;
  userId: string | null;
  ws: string | null;
  onRemover: (r: Remocao) => void;
}

/**
 * Um dia do roteiro. A lista de atividades é recriada a cada mudança no
 * roteiro, então a comparação olha item a item: o dia só redesenha quando
 * uma atividade DELE mudou.
 */
const DiaDoRoteiro = memo(
  function DiaDoRoteiro({ dia, numero, itens, totalDeAtividades, custoDoDia, userId, ws, onRemover }: PropsDia) {
    const removerDia = () =>
      onRemover({
        id: dia.id,
        tipo: "dia",
        mensagem: `Dia ${numero} removido${totalDeAtividades ? ` com ${totalDeAtividades === 1 ? "1 atividade" : `${totalDeAtividades} atividades`}` : ""}.`,
      });
    return (
      <section className="glass-panel rounded-2xl p-6" aria-label={`Dia ${numero}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="font-serif text-2xl font-bold text-[var(--color-subtle)]">{String(numero).padStart(2, "0")}</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{formatarDataDoDia(dia.data)}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  type="date"
                  aria-label={`Data do dia ${numero}`}
                  value={dia.data ?? ""}
                  onChange={(e) => atualizarRegistro("roteiro_dias", dia.id, { data: e.target.value || null })}
                  className="glass-input max-w-[180px]"
                />
                <input
                  type="text"
                  aria-label={`Destino do dia ${numero}`}
                  placeholder="Destino (opcional)"
                  value={dia.destino ?? ""}
                  maxLength={80}
                  onChange={(e) => atualizarRegistro("roteiro_dias", dia.id, { destino: e.target.value || null })}
                  className="glass-input max-w-[220px]"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start lg:self-auto">
            <p className="text-xs text-[var(--color-muted)]" data-custo-do-dia>
              {custoDoDia > 0 ? (
                <>
                  Custo estimado do dia: <strong className="text-[var(--color-heading)]">{formatarReais(custoDoDia)}</strong>
                </>
              ) : (
                "Sem custo estimado"
              )}
            </p>
            <button
              type="button"
              onClick={removerDia}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              Remover dia
            </button>
          </div>
        </div>
        <div className="space-y-2.5">
          {itens.map((item) => (
            <LinhaAtividade key={item.id} item={item} onRemover={onRemover} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => userId && ws && adicionarAtividade(userId, ws, dia.id)}
          className="mt-3 px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
        >
          + Adicionar atividade
        </button>
      </section>
    );
  },
  (a, b) =>
    a.dia === b.dia &&
    a.numero === b.numero &&
    a.totalDeAtividades === b.totalDeAtividades &&
    a.custoDoDia === b.custoDoDia &&
    a.userId === b.userId &&
    a.ws === b.ws &&
    a.onRemover === b.onRemover &&
    mesmosItens(a.itens, b.itens)
);

const ROTULO_ORIGEM = { planilha: "Planilha", nora_sugestao: "Sugestão da Nora" } as const;

const LinhaAtividade = memo(function LinhaAtividade({
  item,
  onRemover,
}: {
  item: RoteiroItem;
  onRemover: (r: Remocao) => void;
}) {
  // Rascunho do custo enquanto a pessoa digita ("12," ainda não é um número).
  const [rascunho, setRascunho] = useState<string | null>(null);
  const origem = item.origem && item.origem !== "manual" ? item.origem : null;
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-3 space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr_1fr_auto] gap-2.5 items-center">
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
          onClick={() =>
            onRemover({ id: item.id, tipo: "atividade", mensagem: `Atividade “${item.titulo || "sem título"}” removida.` })
          }
          aria-label="Remover atividade"
          className="justify-self-end px-2.5 py-2 rounded-lg text-xs text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <select
          aria-label="Categoria"
          value={categoriaDoItem(item)}
          onChange={(e) => atualizarRegistro("roteiro_itens", item.id, { categoria: e.target.value || null })}
          className="glass-input max-w-[160px]"
        >
          <option value="">Sem categoria</option>
          {CATEGORIAS_ROTEIRO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {!item.horario && (
          <select
            aria-label="Turno"
            value={item.turno ?? ""}
            onChange={(e) => atualizarRegistro("roteiro_itens", item.id, { turno: (e.target.value || null) as TurnoRoteiro | null })}
            className="glass-input max-w-[130px]"
          >
            <option value="">Sem turno</option>
            {TURNOS_ROTEIRO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TURNO[t]}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          inputMode="decimal"
          aria-label="Custo estimado em reais"
          placeholder="Custo estimado (R$)"
          value={rascunho ?? (item.custoEstimado === null || item.custoEstimado === undefined ? "" : String(item.custoEstimado).replace(".", ","))}
          onChange={(e) => {
            setRascunho(e.target.value);
            const n = lerCustoDigitado(e.target.value);
            if (n !== undefined) atualizarRegistro("roteiro_itens", item.id, { custoEstimado: n });
          }}
          onBlur={() => setRascunho(null)}
          className="glass-input max-w-[170px]"
        />
        {origem && (
          <span
            data-origem-atividade={origem}
            className="inline-flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--color-muted)]"
          >
            {origem === "nora_sugestao" && <Sparkles className="h-3 w-3" />}
            {ROTULO_ORIGEM[origem]}
          </span>
        )}
      </div>
    </div>
  );
});
