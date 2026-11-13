"use client";

import { Activity, memo, useCallback, useMemo, useState, useTransition } from "react";
import { ChevronDown, Layers, Lock, Search, ShieldCheck, Users, X } from "@/components/ui/icons";
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
import { combina, indiceDeBusca, normalizarBusca } from "@/lib/ui/busca";
import { useDebounce } from "@/lib/ui/use-debounce";
import { DURACAO_DESFAZER_MS, useRemocaoAdiada } from "@/lib/ui/use-remocao-adiada";

/**
 * Lista do DuoFinance (gastos da viagem e pessoais), com edição em linha:
 * categoria, 🔒 Privado / 👥 Compartilhado e remoção com "Desfazer" (5 s).
 *
 * Cada mudança entra na fila de sincronização e aparece na hora (a fila é
 * aplicada por cima da cópia do servidor), inclusive offline; a remoção só
 * vai para a fila quando o prazo do "Desfazer" acaba.
 *
 * Lista longa (fatura importada = centenas de linhas): mostra 50 por vez
 * ("Carregar mais", em transição), com busca sem acento que filtra uma vez
 * por pausa na digitação (300 ms). Os totais e o acerto continuam usando
 * todos os gastos: a paginação é só da tela. Cada linha é memoizada (editar
 * uma não redesenha as outras), as fora da tela pulam o layout
 * (`content-visibility`) e as duas abas ficam montadas (`<Activity>`).
 */

/** Linhas por página da lista (e a cada "Carregar mais"). */
export const LINHAS_POR_PAGINA = 50;

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
  const ativa = aba === "compartilhado" ? compartilhados : privados;

  const [busca, setBusca] = useState("");
  const buscaAplicada = useDebounce(busca);
  const termo = normalizarBusca(buscaAplicada);

  const comuns = {
    termo,
    buscaAplicada,
    meuId,
    temEspaco: Boolean(ctx?.workspace),
    membros: ctx?.membros ?? SEM_MEMBROS,
    onRemover: remocao.remover,
  };

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3" role="tablist" aria-label="Tipo de gasto">
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
        {ativa.length > 0 && (
          <label className="relative block sm:w-64">
            <span className="sr-only">Buscar gastos</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar (ex.: mercado, 12/2026)"
              maxLength={80}
              autoComplete="off"
              className="glass-input w-full py-2 pl-8 pr-3 text-xs"
            />
          </label>
        )}
      </div>

      {/* As duas abas ficam montadas: a escondida é pré-renderizada em segundo
          plano (prioridade baixa) e trocar de aba só a revela, sem desmontar
          e montar dezenas de linhas. Cada aba guarda a própria página. */}
      <Activity mode={aba === "compartilhado" ? "visible" : "hidden"}>
        <ListaDaAba itens={compartilhados} vazio="da viagem" {...comuns} />
      </Activity>
      <Activity mode={aba === "privado" ? "visible" : "hidden"}>
        <ListaDaAba itens={privados} vazio="pessoal" {...comuns} />
      </Activity>

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

const SEM_MEMBROS: NonNullable<ReturnType<typeof useContextoSync>>["membros"] = [];

/**
 * A lista de uma aba. Memoizada: digitar na busca redesenha só o campo (o
 * filtro chega depois, na pausa), e as props são estáveis entre teclas.
 */
const ListaDaAba = memo(function ListaDaAba({
  itens,
  vazio,
  termo,
  buscaAplicada,
  meuId,
  temEspaco,
  membros,
  onRemover,
}: {
  itens: Despesa[];
  vazio: "da viagem" | "pessoal";
  termo: string;
  buscaAplicada: string;
  meuId: string | null;
  temEspaco: boolean;
  membros: NonNullable<ReturnType<typeof useContextoSync>>["membros"];
  onRemover: (d: Despesa) => void;
}) {
  // Índice da busca só existe enquanto há busca, e é montado uma vez por
  // mudança na lista (não a cada tecla).
  const buscando = termo !== "";
  const indice = useMemo(
    () =>
      buscando
        ? new Map(
            itens.map((d) => [
              d.id,
              indiceDeBusca([d.descricao, d.oQueFoiGasto, d.categoriaDetalhada, rotuloCategoria(d), isoToBR(d.data), formatarMoeda(d.valor, d.moeda)]),
            ])
          )
        : null,
    [itens, buscando]
  );
  const filtrados = useMemo(() => (indice ? itens.filter((d) => combina(indice.get(d.id) ?? "", termo)) : itens), [itens, indice, termo]);

  // Busca nova volta para a primeira página.
  const [paginaDe, setPaginaDe] = useState(termo);
  const [limite, setLimite] = useState(LINHAS_POR_PAGINA);
  if (paginaDe !== termo) {
    setPaginaDe(termo);
    setLimite(LINHAS_POR_PAGINA);
  }
  // Mais 50 linhas é trabalho grande e não urgente: em transição, o toque
  // responde na hora e as linhas entram sem travar a tela.
  const [expandindo, expandir] = useTransition();
  const visiveis = filtrados.length > limite ? filtrados.slice(0, limite) : filtrados;
  const restantes = filtrados.length - visiveis.length;

  const nomeDe = (id: string | null) => (id === meuId ? "você" : (membros.find((m) => m.userId === id)?.nome ?? "seu par"));

  if (itens.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-muted)]">
        Nenhum gasto {vazio} ainda. Importe uma fatura, leia um recibo ou adicione um lançamento.
      </p>
    );
  }
  if (filtrados.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-muted)]" role="status">
        Nenhum gasto encontrado para “{buscaAplicada.trim()}”.
      </p>
    );
  }
  return (
    <>
      {buscando && (
        <p className="mb-3 text-xs text-[var(--color-muted)]" role="status">
          {filtrados.length === 1 ? "1 gasto encontrado" : filtrados.length + " gastos encontrados"}
        </p>
      )}
      <ul className="space-y-3">
        {visiveis.map((d) => (
          <LinhaGasto
            key={d.id}
            d={d}
            meu={d.userId === meuId}
            temEspaco={temEspaco}
            pagador={d.escopo === "viagem_compartilhado" ? nomeDe(d.pagoPor ?? d.userId) : null}
            onRemover={onRemover}
          />
        ))}
      </ul>
      {restantes > 0 && (
        <button
          type="button"
          onClick={() => expandir(() => setLimite((n) => n + LINHAS_POR_PAGINA))}
          disabled={expandindo}
          aria-busy={expandindo || undefined}
          className="mt-4 w-full rounded-xl glass-panel px-4 py-2.5 text-xs font-semibold text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors disabled:cursor-progress"
        >
          {expandindo
            ? "Carregando…"
            : `Carregar mais ${Math.min(restantes, LINHAS_POR_PAGINA)} (${restantes} ${restantes === 1 ? "restante" : "restantes"})`}
        </button>
      )}
    </>
  );
});

/** Memoizada: o motor mantém o objeto de cada gasto sem alteração, então só a linha editada redesenha. */
const LinhaGasto = memo(function LinhaGasto({
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
    // Altura reservada das linhas que nunca apareceram na tela (medida no
    // painel-producao.spec.ts): ~184 px no celular, com os controles quebrando
    // linha; 118 px do sm ao lg; 68 px em linha a partir do lg. Reserva errada
    // faz a página pular na rolagem e o alvo do toque mudar de lugar.
    <li className="rounded-xl border border-[var(--color-border)] px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_184px] sm:[contain-intrinsic-size:auto_118px] lg:[contain-intrinsic-size:auto_68px]">
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
});
