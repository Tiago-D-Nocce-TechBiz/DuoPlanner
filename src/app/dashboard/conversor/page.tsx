"use client";

import { useMemo, useState } from "react";
import { Shuffle } from "@/components/ui/icons";

/**
 * Conversor de Moedas.
 *
 * Converte entre moedas comuns de viagem usando taxas de REFERÊNCIA (aproximadas
 * e editáveis). Na Fase Back, as cotações ao vivo serão integradas por API.
 * Enquanto isso, o usuário pode ajustar a taxa manualmente. 100% em PT-BR.
 */

// Taxas aproximadas em relação ao Real (1 unidade da moeda = X reais).
// Editáveis pelo usuário; servem só de referência inicial.
const MOEDAS: { codigo: string; nome: string; emReais: number }[] = [
  { codigo: "BRL", nome: "Real", emReais: 1 },
  { codigo: "USD", nome: "Dólar americano", emReais: 5.4 },
  { codigo: "EUR", nome: "Euro", emReais: 5.9 },
  { codigo: "GBP", nome: "Libra", emReais: 6.9 },
  { codigo: "ARS", nome: "Peso argentino", emReais: 0.0055 },
  { codigo: "CLP", nome: "Peso chileno", emReais: 0.0057 },
];

export default function ConversorPage() {
  const [valor, setValor] = useState("100");
  const [de, setDe] = useState("USD");
  const [para, setPara] = useState("BRL");
  const [taxas, setTaxas] = useState(() =>
    Object.fromEntries(MOEDAS.map((m) => [m.codigo, m.emReais]))
  );

  const resultado = useMemo(() => {
    const v = parseFloat(valor.replace(",", ".")) || 0;
    const reais = v * (taxas[de] ?? 0);
    return reais / (taxas[para] ?? 1);
  }, [valor, de, para, taxas]);

  const inverter = () => {
    setDe(para);
    setPara(de);
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Conversor de Moedas
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Converta valores entre moedas para planejar os gastos da viagem.
        </p>
      </div>

      {/* Conversor */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Valor em</label>
            <div className="flex gap-2">
              <input value={valor} onChange={(e) => setValor(e.target.value)} className="glass-input" placeholder="100" />
              <select value={de} onChange={(e) => setDe(e.target.value)} className="glass-input sm:max-w-[120px]">
                {MOEDAS.map((m) => (
                  <option key={m.codigo} value={m.codigo}>{m.codigo}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={inverter}
            aria-label="Inverter moedas"
            className="flex h-11 w-11 self-end items-center justify-center rounded-xl glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer text-[var(--color-heading)]"
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Convertido para</label>
            <select value={para} onChange={(e) => setPara(e.target.value)} className="glass-input">
              {MOEDAS.map((m) => (
                <option key={m.codigo} value={m.codigo}>{m.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
            {fmt(resultado)} <span className="text-lg text-[var(--color-muted)]">{para}</span>
          </p>
        </div>
      </div>

      {/* Taxas editáveis */}
      <div className="glass-panel rounded-2xl p-6">
        <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Taxas de referência</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Valores aproximados (1 unidade da moeda em reais). Ajuste conforme a cotação do dia. A cotação ao vivo chega na próxima fase.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MOEDAS.filter((m) => m.codigo !== "BRL").map((m) => (
            <div key={m.codigo} className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2">
              <span className="text-sm text-[var(--color-foreground)] flex-1">1 {m.codigo} =</span>
              <input
                type="number"
                step="0.0001"
                value={taxas[m.codigo]}
                onChange={(e) => setTaxas((prev) => ({ ...prev, [m.codigo]: parseFloat(e.target.value) || 0 }))}
                className="glass-input max-w-[110px] text-right"
              />
              <span className="text-xs text-[var(--color-muted)]">R$</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
