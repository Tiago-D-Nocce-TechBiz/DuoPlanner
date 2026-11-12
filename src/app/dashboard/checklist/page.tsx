"use client";

import { useCallback, useMemo, useState } from "react";
import { ToastDesfazer } from "@/components/ui/toast-desfazer";
import type { ItemChecklist } from "@/lib/sync/modelos";
import {
  atualizarRegistro,
  criarRegistro,
  removerRegistro,
  useContextoSync,
  useRegistros,
  useStatusSync,
} from "@/lib/sync/motor";
import { DURACAO_DESFAZER_MS, useRemocaoAdiada } from "@/lib/ui/use-remocao-adiada";

/**
 * Checklist de Viagem / Bagagem do casal, sincronizado.
 *
 * Marcar um item no celular de um aparece no do outro na hora (Realtime).
 * Offline, a última cópia fica no aparelho e as marcações sobem depois.
 * As sugestões iniciais só entram quando alguém pede (antes eram criadas
 * sozinhas em cada navegador, o que duplicaria tudo com dois aparelhos).
 * Remover tem "Desfazer" por 5 s (a remoção só sincroniza depois do prazo).
 */

const CATEGORIAS = [
  "Documentos",
  "Roupas",
  "Eletrônicos",
  "Higiene",
  "Saúde",
  "Mão / Essenciais",
] as const;

const SUGESTOES: { categoria: string; texto: string }[] = [
  { categoria: "Documentos", texto: "RG / Passaporte" },
  { categoria: "Documentos", texto: "Cartão de embarque" },
  { categoria: "Documentos", texto: "Seguro viagem" },
  { categoria: "Roupas", texto: "Roupas para os dias da viagem" },
  { categoria: "Roupas", texto: "Casaco / agasalho" },
  { categoria: "Eletrônicos", texto: "Carregador e power bank" },
  { categoria: "Eletrônicos", texto: "Adaptador de tomada" },
  { categoria: "Higiene", texto: "Escova e pasta de dente" },
  { categoria: "Saúde", texto: "Remédios de uso contínuo" },
  { categoria: "Mão / Essenciais", texto: "Fone de ouvido" },
];

export default function ChecklistPage() {
  const todos = useRegistros("checklist");
  const ctx = useContextoSync();
  const status = useStatusSync();
  const ws = ctx?.workspace?.id ?? null;
  const [novoTexto, setNovoTexto] = useState("");
  const [novaCategoria, setNovaCategoria] = useState<string>(CATEGORIAS[0]);

  const efetivarRemocao = useCallback((item: ItemChecklist) => removerRegistro("checklist", item.id), []);
  const remocao = useRemocaoAdiada("checklist", efetivarRemocao);
  const oculto = remocao.pendente?.id ?? null;
  const itens = useMemo(() => (oculto ? todos.filter((i) => i.id !== oculto) : todos), [todos, oculto]);

  const ordenados = useMemo(() => [...itens].sort((a, b) => a.ordem - b.ordem), [itens]);
  const categorias = useMemo(() => {
    const extras = [...new Set(itens.map((i) => i.categoria))].filter((c) => !(CATEGORIAS as readonly string[]).includes(c));
    return [...CATEGORIAS, ...extras];
  }, [itens]);

  function novoItem(texto: string, categoria: string, ordem: number): ItemChecklist | null {
    if (!ctx || !ws) return null;
    return {
      id: crypto.randomUUID(),
      workspaceId: ws,
      userId: ctx.userId,
      texto: texto.slice(0, 120),
      categoria,
      feito: false,
      ordem,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: ctx.userId,
    };
  }

  // Inclui o item oculto: a ordem dele continua reservada caso a pessoa desfaça.
  const proximaOrdem = () => todos.reduce((max, i) => Math.max(max, i.ordem), -1) + 1;

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    const item = novoItem(novoTexto.trim(), novaCategoria, proximaOrdem());
    if (!item || !item.texto) return;
    criarRegistro("checklist", item);
    setNovoTexto("");
  };

  const adicionarSugestoes = () => {
    let ordem = proximaOrdem();
    for (const s of SUGESTOES) {
      const item = novoItem(s.texto, s.categoria, ordem++);
      if (item) criarRegistro("checklist", item);
    }
  };

  const feitos = itens.filter((i) => i.feito).length;
  const progresso = itens.length ? Math.round((feitos / itens.length) * 100) : 0;
  const carregando = status.modo === "carregando" && itens.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">Checklist de Viagem</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Organizem a bagagem e os preparativos por categoria. O que um marca aparece para o outro.
        </p>
      </div>

      {/* Barra de progresso */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[var(--color-heading)]">
            {feitos} de {itens.length} itens prontos
          </span>
          <span className="text-sm font-semibold text-[var(--color-heading)]">{progresso}%</span>
        </div>
        <div
          className="h-2.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={progresso}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso do checklist"
        >
          <div className="h-full rounded-full bg-[var(--color-accent)] transition-all" style={{ width: `${progresso}%` }} />
        </div>
      </div>

      {/* Adicionar item */}
      <form onSubmit={adicionar} className="glass-panel rounded-2xl p-5 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          aria-label="Novo item"
          value={novoTexto}
          onChange={(e) => setNovoTexto(e.target.value)}
          placeholder="Adicionar item (ex.: protetor solar)"
          maxLength={120}
          className="glass-input flex-1"
        />
        <select aria-label="Categoria" value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} className="glass-input sm:max-w-[200px]">
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!ws}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
        >
          + Adicionar
        </button>
      </form>

      {itens.length === 0 && !carregando && (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-sm text-[var(--color-muted)]">O checklist do casal está vazio.</p>
          <button
            type="button"
            onClick={adicionarSugestoes}
            disabled={!ws}
            className="mt-4 px-4 py-2.5 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer disabled:opacity-60"
          >
            Começar com sugestões ({SUGESTOES.length} itens)
          </button>
        </div>
      )}

      {/* Itens por categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {categorias.map((cat) => {
          const doCat = ordenados.filter((i) => i.categoria === cat);
          if (doCat.length === 0) return null;
          return (
            <section key={cat} className="glass-panel rounded-2xl p-5" aria-label={cat}>
              <h2 className="font-serif text-lg font-bold text-[var(--color-heading)] mb-3">{cat}</h2>
              <ul className="space-y-2">
                {doCat.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2.5">
                    <input
                      id={`item-${item.id}`}
                      type="checkbox"
                      checked={item.feito}
                      onChange={() => atualizarRegistro("checklist", item.id, { feito: !item.feito })}
                      className="h-4 w-4 rounded border-[var(--color-border)] cursor-pointer"
                    />
                    <label
                      htmlFor={`item-${item.id}`}
                      className={`flex-1 text-sm cursor-pointer ${item.feito ? "line-through text-[var(--color-subtle)]" : "text-[var(--color-foreground)]"}`}
                    >
                      {item.texto}
                    </label>
                    <button
                      type="button"
                      onClick={() => remocao.remover(item)}
                      aria-label={`Remover ${item.texto}`}
                      className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)] cursor-pointer"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {remocao.pendente && (
        <ToastDesfazer
          key={remocao.pendente.id}
          mensagem={`“${remocao.pendente.texto}” saiu do checklist.`}
          duracaoMs={DURACAO_DESFAZER_MS}
          onDesfazer={remocao.desfazer}
          onFechar={remocao.confirmar}
        />
      )}
    </div>
  );
}
