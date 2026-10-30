"use client";

import { useMemo, useState } from "react";
import { readLocal, writeLocal, useMontado, STORAGE_KEYS } from "@/lib/local-store";

/**
 * Checklist de Viagem / Bagagem.
 *
 * Itens organizados por categoria (documentos, roupas, eletrônicos, higiene,
 * saúde, bagagem de mão). Cada item pode ser marcado como feito, adicionado ou
 * removido. Persiste no navegador (Fase Front); pronto para sincronizar na
 * Fase Back. 100% em PT-BR.
 */

interface ItemCheck {
  id: string;
  texto: string;
  feito: boolean;
  categoria: string;
}

const CATEGORIAS = [
  "Documentos",
  "Roupas",
  "Eletrônicos",
  "Higiene",
  "Saúde",
  "Mão / Essenciais",
] as const;

// Sugestão inicial — o usuário pode remover/adicionar à vontade.
const SUGESTOES: Omit<ItemCheck, "id" | "feito">[] = [
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

const novoId = () => Math.random().toString(36).substring(2, 9);

export default function ChecklistPage() {
  const montado = useMontado();
  const [novoTexto, setNovoTexto] = useState("");
  const [novaCategoria, setNovaCategoria] = useState<string>(CATEGORIAS[0]);

  // Leitura inicial determinística: no servidor/1º render fica vazio; após a
  // montagem, carrega o salvo ou as sugestões iniciais. Sem setState em efeito.
  const inicial = useMemo<ItemCheck[]>(() => {
    if (!montado) return [];
    const salvo = readLocal<ItemCheck[] | null>(STORAGE_KEYS.checklist, null);
    if (salvo && salvo.length) return salvo;
    return SUGESTOES.map((s) => ({ ...s, id: novoId(), feito: false }));
  }, [montado]);

  const [alteracoes, setAlteracoes] = useState<ItemCheck[] | null>(null);
  const itens = alteracoes ?? inicial;

  function persistir(next: ItemCheck[]) {
    setAlteracoes(next);
    writeLocal(STORAGE_KEYS.checklist, next);
  }

  const alternar = (id: string) =>
    persistir(itens.map((i) => (i.id === id ? { ...i, feito: !i.feito } : i)));
  const remover = (id: string) => persistir(itens.filter((i) => i.id !== id));
  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTexto.trim()) return;
    persistir([
      ...itens,
      { id: novoId(), texto: novoTexto.trim(), feito: false, categoria: novaCategoria },
    ]);
    setNovoTexto("");
  };

  const feitos = itens.filter((i) => i.feito).length;
  const progresso = itens.length ? Math.round((feitos / itens.length) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Checklist de Viagem
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Organize a bagagem e os preparativos por categoria. Marque o que já está pronto.
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
        <div className="h-2.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all"
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>

      {/* Adicionar item */}
      <form onSubmit={adicionar} className="glass-panel rounded-2xl p-5 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={novoTexto}
          onChange={(e) => setNovoTexto(e.target.value)}
          placeholder="Adicionar item (ex.: protetor solar)"
          className="glass-input flex-1"
        />
        <select
          value={novaCategoria}
          onChange={(e) => setNovaCategoria(e.target.value)}
          className="glass-input sm:max-w-[200px]"
        >
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
        >
          + Adicionar
        </button>
      </form>

      {/* Itens por categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {CATEGORIAS.map((cat) => {
          const doCat = itens.filter((i) => i.categoria === cat);
          if (doCat.length === 0) return null;
          return (
            <div key={cat} className="glass-panel rounded-2xl p-5">
              <h2 className="font-serif text-lg font-bold text-[var(--color-heading)] mb-3">{cat}</h2>
              <ul className="space-y-2">
                {doCat.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={item.feito}
                      onChange={() => alternar(item.id)}
                      className="h-4 w-4 rounded border-[var(--color-border)] cursor-pointer"
                    />
                    <span className={`flex-1 text-sm ${item.feito ? "line-through text-[var(--color-subtle)]" : "text-[var(--color-foreground)]"}`}>
                      {item.texto}
                    </span>
                    <button
                      type="button"
                      onClick={() => remover(item.id)}
                      aria-label="Remover item"
                      className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)] cursor-pointer"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
