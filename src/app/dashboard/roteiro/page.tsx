"use client";

import { memo, useMemo } from "react";
import { Map as IconeMapa } from "@/components/ui/icons";
import { ToastDesfazer } from "@/components/ui/toast-desfazer";
import type { RoteiroDia, RoteiroItem } from "@/lib/sync/modelos";
import {
  atualizarRegistro,
  criarRegistro,
  getRegistros,
  removerRegistro,
  useContextoSync,
  useRegistros,
} from "@/lib/sync/motor";
import { DURACAO_DESFAZER_MS, useRemocaoAdiada } from "@/lib/ui/use-remocao-adiada";

/**
 * Roteiro do casal — dias e atividades sincronizados (Postgres + Realtime).
 *
 * O que um muda aparece para o outro na hora; offline, a última cópia fica no
 * aparelho e as alterações sobem quando a conexão voltar. Cada tecla vira uma
 * única atualização na fila (as edições ainda não enviadas se combinam; o
 * envio espera 700 ms de pausa e o disco também é gravado com atraso).
 * Remover um dia ou uma atividade tem "Desfazer" por 5 s.
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

function formatarData(iso: string | null): string {
  if (!iso) return "Dia sem data";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const proximaOrdem = (lista: { ordem: number }[]) => lista.reduce((max, x) => Math.max(max, x.ordem), -1) + 1;

const agora = () => new Date().toISOString();

/** Nova atividade no fim do dia (ordem lida na hora, com as do par recém-chegadas). */
function adicionarAtividade(userId: string, ws: string, diaId: string) {
  const doDia = getRegistros("roteiro_itens").filter((i) => i.diaId === diaId);
  const item: RoteiroItem = {
    id: crypto.randomUUID(),
    workspaceId: ws,
    diaId,
    horario: "",
    titulo: "",
    nota: "",
    ordem: proximaOrdem(doDia),
    atualizadoEm: agora(),
    atualizadoPor: userId,
  };
  criarRegistro("roteiro_itens", item);
}

const mesmosItens = (a: readonly RoteiroItem[], b: readonly RoteiroItem[]) =>
  a.length === b.length && a.every((item, i) => item === b[i]);

const SEM_ITENS: RoteiroItem[] = [];

export default function RoteiroPage() {
  const dias = useRegistros("roteiro_dias");
  const itens = useRegistros("roteiro_itens");
  const ctx = useContextoSync();
  const ws = ctx?.workspace?.id ?? null;
  const userId = ctx?.userId ?? null;

  const remocao = useRemocaoAdiada<Remocao>("roteiro", efetivarRemocao);
  const oculto = remocao.pendente?.id ?? null;

  const diasOrdenados = useMemo(
    () =>
      dias
        .filter((d) => d.id !== oculto)
        .sort((a, b) => a.ordem - b.ordem || (a.data ?? "").localeCompare(b.data ?? "")),
    [dias, oculto]
  );
  const itensPorDia = useMemo(() => {
    const mapa = new Map<string, RoteiroItem[]>();
    for (const item of itens) {
      if (!item.diaId || item.id === oculto) continue;
      mapa.set(item.diaId, [...(mapa.get(item.diaId) ?? []), item]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.ordem - b.ordem);
    return mapa;
  }, [itens, oculto]);

  const adicionarDia = () => {
    if (!userId || !ws) return;
    const dia: RoteiroDia = {
      id: crypto.randomUUID(),
      workspaceId: ws,
      userId,
      data: null,
      ordem: proximaOrdem(dias),
      atualizadoEm: agora(),
      atualizadoPor: userId,
    };
    criarRegistro("roteiro_dias", dia);
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
            <DiaDoRoteiro
              key={dia.id}
              dia={dia}
              numero={idx + 1}
              itens={itensPorDia.get(dia.id) ?? SEM_ITENS}
              userId={userId}
              ws={ws}
              onRemover={remocao.remover}
            />
          ))}
        </div>
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
  itens: RoteiroItem[];
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
  function DiaDoRoteiro({ dia, numero, itens, userId, ws, onRemover }: PropsDia) {
    const removerDia = () =>
      onRemover({
        id: dia.id,
        tipo: "dia",
        mensagem: `Dia ${numero} removido${itens.length ? ` com ${itens.length === 1 ? "1 atividade" : `${itens.length} atividades`}` : ""}.`,
      });

    return (
      <section className="glass-panel rounded-2xl p-6" aria-label={`Dia ${numero}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="font-serif text-2xl font-bold text-[var(--color-subtle)]">{String(numero).padStart(2, "0")}</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{formatarData(dia.data)}</p>
              <input
                type="date"
                aria-label={`Data do dia ${numero}`}
                value={dia.data ?? ""}
                onChange={(e) => atualizarRegistro("roteiro_dias", dia.id, { data: e.target.value || null })}
                className="glass-input mt-1 max-w-[180px]"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={removerDia}
            className="self-start px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            Remover dia
          </button>
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
    a.userId === b.userId &&
    a.ws === b.ws &&
    a.onRemover === b.onRemover &&
    mesmosItens(a.itens, b.itens)
);

const LinhaAtividade = memo(function LinhaAtividade({
  item,
  onRemover,
}: {
  item: RoteiroItem;
  onRemover: (r: Remocao) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-3 grid grid-cols-1 sm:grid-cols-[100px_1fr_1fr_auto] gap-2.5 items-center">
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
  );
});
