"use client";

import { useState } from "react";

/**
 * Acerto de Contas — "quem deve a quem".
 *
 * Registra despesas compartilhadas informando quem pagou. Divide igualmente
 * entre os dois viajantes e calcula o acerto final (quem paga quanto a quem).
 * Estado local na Fase Front. 100% em PT-BR.
 */

interface Lancamento {
  id: string;
  descricao: string;
  valor: number;
  quemPagou: "viajante1" | "viajante2";
}

const novoId = () => Math.random().toString(36).substring(2, 9);
const brl = (v: number) => `R$ ${Math.abs(v).toFixed(2).replace(".", ",")}`;

export default function AcertoPage() {
  const [nome1, setNome1] = useState("Viajante 1");
  const [nome2, setNome2] = useState("Viajante 2");
  const [itens, setItens] = useState<Lancamento[]>([]);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [quemPagou, setQuemPagou] = useState<Lancamento["quemPagou"]>("viajante1");

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(valor.replace(",", "."));
    if (!descricao.trim() || isNaN(v) || v <= 0) return;
    setItens((prev) => [
      { id: novoId(), descricao: descricao.trim(), valor: v, quemPagou },
      ...prev,
    ]);
    setDescricao("");
    setValor("");
  };
  const remover = (id: string) => setItens((prev) => prev.filter((i) => i.id !== id));

  const total = itens.reduce((a, i) => a + i.valor, 0);
  const pago1 = itens.filter((i) => i.quemPagou === "viajante1").reduce((a, i) => a + i.valor, 0);
  const pago2 = total - pago1;
  const metade = total / 2;
  // Saldo do viajante 1: positivo = tem a receber; negativo = deve.
  const saldo1 = pago1 - metade;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Acerto de Contas
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Registre quem pagou cada despesa compartilhada e veja o acerto final da dupla.
        </p>
      </div>

      {/* Nomes dos viajantes */}
      <div className="glass-panel rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={nome1} onChange={(e) => setNome1(e.target.value)} className="glass-input" placeholder="Nome do viajante 1" />
        <input value={nome2} onChange={(e) => setNome2(e.target.value)} className="glass-input" placeholder="Nome do viajante 2" />
      </div>

      {/* Resumo do acerto */}
      <div className="glass-panel rounded-2xl p-6 text-center">
        {total === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Adicione lançamentos para calcular o acerto.</p>
        ) : saldo1 === 0 ? (
          <p className="font-serif text-xl font-bold text-[var(--color-heading)]">Contas equilibradas! Ninguém deve nada. 🎉</p>
        ) : (
          <>
            <p className="text-sm text-[var(--color-muted)]">Acerto final</p>
            <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold text-[var(--color-heading)]">
              {saldo1 < 0 ? nome1 : nome2} paga {brl(saldo1)} para {saldo1 < 0 ? nome2 : nome1}
            </p>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Total gasto {brl(total)} · cada um deve arcar com {brl(metade)}
            </p>
          </>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3 text-left">
          <div className="rounded-xl border border-[var(--color-border)] p-3">
            <span className="text-[10px] font-mono uppercase text-[var(--color-subtle)]">{nome1} pagou</span>
            <p className="mt-1 font-serif text-lg font-bold text-[var(--color-heading)]">{brl(pago1)}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] p-3">
            <span className="text-[10px] font-mono uppercase text-[var(--color-subtle)]">{nome2} pagou</span>
            <p className="mt-1 font-serif text-lg font-bold text-[var(--color-heading)]">{brl(pago2)}</p>
          </div>
        </div>
      </div>

      {/* Adicionar lançamento */}
      <form onSubmit={adicionar} className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Novo lançamento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição" className="glass-input" />
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor R$ (ex.: 120,00)" className="glass-input" />
          <select value={quemPagou} onChange={(e) => setQuemPagou(e.target.value as Lancamento["quemPagou"])} className="glass-input">
            <option value="viajante1">{nome1} pagou</option>
            <option value="viajante2">{nome2} pagou</option>
          </select>
        </div>
        <button type="submit" className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer">
          + Adicionar lançamento
        </button>
      </form>

      {/* Lista de lançamentos */}
      {itens.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-2.5">
          {itens.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-heading)]">{i.descricao}</p>
                <p className="text-xs text-[var(--color-muted)]">Pago por {i.quemPagou === "viajante1" ? nome1 : nome2}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-serif font-bold text-sm text-[var(--color-heading)]">{brl(i.valor)}</span>
                <button type="button" onClick={() => remover(i.id)} aria-label="Remover" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)] cursor-pointer">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
