"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Layers, Lock, ShieldCheck, Users, X } from "@/components/ui/icons";
import { ToastDesfazer } from "@/components/ui/toast-desfazer";
import { formatarMoeda } from "@/lib/cambio/use-cotacoes";
import { isoToBR } from "@/lib/dates";
import { valorEmReais } from "@/lib/finance/acerto";
import { CATEGORIAS } from "@/lib/finance/classificar";
import { formatBRL, toCents } from "@/lib/finance/money";
import {
  atualizarDespesa,
  removerDespesa,
  rotuloCategoria,
  useDespesas,
  type Categoria,
  type Despesa,
  type Escopo,
} from "@/lib/finance/store";
import { useContextoSync } from "@/lib/sync/motor";
import { DURACAO_DESFAZER_MS, useRemocaoAdiada } from "@/lib/ui/use-remocao-adiada";

/**
 * Lista do DuoFinance (gastos da viagem e pessoais), com edição em linha:
 * categoria, 🔒 Privado / 👥 Compartilhado e remoção com "Desfazer" (5 s).
 *
 * Cada mudança entra na fila de sincronização e aparece na hora (a fila é
 * aplicada por cima da cópia do servidor), inclusive offline; a remoção só
 * vai para a fila quando o prazo do "Desfazer" acaba.
 */

const brl = (v: number) => formatBRL(toCents(v));
const doisDigitos = (n: number) => String(n).padStart(2, "0");

const ROTULO_ORIGEM: Partial<Record<Despesa["origem"], string>> = {
  recibo: "Recibo",
  nora: "Nora",
  importacao: "Fatura",
  legado: "Importado do navegador",
};

function porData(a: Despesa, b: Despesa): number {
  return b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm);
}

export function ListaGastos() {
  const despesas = useDespesas();
  const ctx = useContextoSync();
  const meuId = ctx?.userId ?? null;
  const [aba, setAba] = useState<"compartilhado" | "privado">("compartilhado");

  const efetivarRemocao = useCallback((d: Despesa) => removerDespesa(d.id), []);
  const remocao = useRemocaoAdiada("despesas", efetivarRemocao);
  const oculto = remocao.pendente?.id ?? null;

  const compartilhados = useMemo(
    () => despesas.filter((d) => d.escopo === "viagem_compartilhado" && d.tipo === "gasto" && d.id !== oculto).sort(porData),
    [despesas, oculto]
  );
  const privados = useMemo(
    () => despesas.filter((d) => d.escopo === "pessoal_privado" && d.userId === meuId && d.id !== oculto).sort(porData),
    [despesas, meuId, oculto]
  );
  const lista = aba === "compartilhado" ? compartilhados : privados;

  const nomeDe = (id: string | null) =>
    id === meuId ? "você" : ctx?.membros.find((m) => m.userId === id)?.nome ?? "seu par";

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6" role="tablist" aria-label="Tipo de gasto">
        {(["compartilhado", "privado"] as const).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            onClick={() => setAba(a)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              aba === a ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "glass-panel text-[var(--color-muted)]"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {a === "compartilhado" ? <Users className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {a === "compartilhado" ? `Da viagem (${compartilhados.length})` : `Pessoais (${privados.length})`}
            </span>
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--color-muted)]">
          Nenhum gasto {aba === "compartilhado" ? "da viagem" : "pessoal"} ainda. Importe uma fatura, leia um recibo ou adicione
          um lançamento.
        </p>
      ) : (
        <ul className="space-y-3">
          {lista.map((d) => (
            <LinhaGasto
              key={d.id}
              d={d}
              meu={d.userId === meuId}
              temEspaco={Boolean(ctx?.workspace)}
              pagador={d.escopo === "viagem_compartilhado" ? nomeDe(d.pagoPor ?? d.userId) : null}
              onRemover={remocao.remover}
            />
          ))}
        </ul>
      )}

      {remocao.pendente && (
        <ToastDesfazer
          key={remocao.pendente.id}
          mensagem={`“${remocao.pendente.descricao}” foi removido.`}
          duracaoMs={DURACAO_DESFAZER_MS}
          onDesfazer={remocao.desfazer}
          onFechar={remocao.confirmar}
        />
      )}
    </div>
  );
}

function LinhaGasto({
  d,
  meu,
  temEspaco,
  pagador,
  onRemover,
}: {
  d: Despesa;
  meu: boolean;
  temEspaco: boolean;
  /** Nome de quem pagou (só nos gastos da viagem). */
  pagador: string | null;
  onRemover: (d: Despesa) => void;
}) {
  const emReais = valorEmReais(d);
  const origem = ROTULO_ORIGEM[d.origem];
  const parcela = d.parcelaAtual && d.totalParcelas ? `${doisDigitos(d.parcelaAtual)}/${doisDigitos(d.totalParcelas)}` : null;
  const compartilhado = d.escopo === "viagem_compartilhado";
  // O banco só deixa quem lançou mudar o tipo; compartilhar exige o espaço do casal.
  const podeAlternar = meu && (compartilhado || (temEspaco && d.workspaceId !== null));
  const motivoBloqueio = !meu
    ? "Só quem lançou pode mudar entre privado e compartilhado"
    : "Convide seu par para compartilhar gastos";

  const trocarCategoria = (categoria: Categoria) =>
    // A categoria detalhada da fatura deixa de valer quando a pessoa escolhe outra.
    atualizarDespesa(d.id, { categoria, categoriaDetalhada: null });
  const alternarEscopo = () =>
    atualizarDespesa(d.id, { escopo: (compartilhado ? "pessoal_privado" : "viagem_compartilhado") as Escopo });

  return (
    <li className="rounded-xl border border-[var(--color-border)] px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_76px]">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--color-heading)] break-words">
          {d.descricao}
          {d.oQueFoiGasto && <span className="font-normal text-[var(--color-muted)]"> — {d.oQueFoiGasto}</span>}
        </p>
        <p className="flex flex-wrap items-center gap-x-1 text-xs text-[var(--color-muted)]">
          <span>
            {isoToBR(d.data)}
            {d.categoriaDetalhada && ` • ${d.categoriaDetalhada}`}
            {pagador && ` • pago por ${pagador}`}
            {origem && ` • ${origem}`}
          </span>
          {parcela && (
            <span
              title={`Parcela ${parcela}`}
              className="ml-1 inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-2 py-0.5 font-semibold text-[var(--color-accent-foreground)]"
            >
              <Layers className="h-3 w-3" />
              {parcela}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
        <span className="mr-1 text-right">
          <span className="block font-serif text-base font-bold text-[var(--color-heading)]">{formatarMoeda(d.valor, d.moeda)}</span>
          {d.moeda !== "BRL" && emReais !== null && <span className="block text-[11px] text-[var(--color-muted)]">≈ {brl(emReais)}</span>}
        </span>

        <div className="relative">
          <select
            value={d.categoria}
            onChange={(e) => trocarCategoria(e.target.value as Categoria)}
            aria-label={`Categoria de ${d.descricao}`}
            className="glass-input appearance-none py-1.5 pl-3 pr-7 text-xs"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {rotuloCategoria({ escopo: d.escopo, categoria: c })}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
        </div>

        <button
          type="button"
          onClick={alternarEscopo}
          disabled={!podeAlternar}
          aria-pressed={compartilhado}
          title={podeAlternar ? "Alternar entre compartilhado com o par e privado" : motivoBloqueio}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all disabled:cursor-default disabled:opacity-70 ${
            compartilhado ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "bg-black/5 dark:bg-white/10 text-[var(--color-muted)]"
          }`}
        >
          {compartilhado ? <Users className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {compartilhado ? "Compartilhado" : "Privado"}
        </button>

        <button
          type="button"
          onClick={() => onRemover(d)}
          aria-label={`Remover ${d.descricao}`}
          title={`Remover ${d.descricao}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--color-heading)] cursor-pointer transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
