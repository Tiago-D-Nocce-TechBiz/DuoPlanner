"use client";

import { useState } from "react";
import { Plus } from "@/components/ui/icons";
import { MOEDAS, useCotacoes } from "@/lib/cambio/use-cotacoes";
import { todayInSaoPaulo } from "@/lib/dates";
import { CATEGORIAS } from "@/lib/finance/classificar";
import { parseValorMonetario } from "@/lib/finance/importar";
import { criarDespesa, type Categoria, type Escopo } from "@/lib/finance/store";
import { useHoje } from "@/lib/local-store";
import { useContextoSync } from "@/lib/sync/motor";

/**
 * Lançamento manual do DuoFinance. Ilha própria: o estado de cada campo fica
 * aqui, então digitar não renderiza de novo o importador nem a lista.
 */
export function FormularioGasto() {
  const ctx = useContextoSync();
  const { taxas, cotacao } = useCotacoes();
  const hoje = useHoje();
  const meuId = ctx?.userId ?? null;
  const par = ctx?.membros.find((m) => m.userId !== meuId) ?? null;

  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [moeda, setMoeda] = useState("BRL");
  const [cotacaoManual, setCotacaoManual] = useState("");
  const [data, setData] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("Alimentação & Gastronomia");
  const [escopo, setEscopo] = useState<Escopo>("viagem_compartilhado");
  const [pagoPeloPar, setPagoPeloPar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cotacaoDaMoeda = moeda === "BRL" ? 1 : taxas[moeda];

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    const valorNum = parseValorMonetario(valor);
    if (!descricao.trim()) return setErro("Informe uma descrição.");
    if (valorNum === null || valorNum <= 0) return setErro("Valor inválido. Use, por exemplo, 180,00 ou 1.250,90.");
    let cotacaoUsada: number | null = null;
    if (moeda !== "BRL") {
      cotacaoUsada = cotacaoManual ? parseValorMonetario(cotacaoManual) : cotacaoDaMoeda ?? null;
      if (!cotacaoUsada || cotacaoUsada <= 0) return setErro(`Informe quanto vale 1 ${moeda} em reais.`);
    }
    const compartilhar = escopo === "viagem_compartilhado";
    const criado = criarDespesa({
      descricao,
      valor: valorNum,
      moeda,
      cotacaoBrl: cotacaoUsada,
      data: data || todayInSaoPaulo(),
      categoria,
      escopo,
      pagoPor: compartilhar && pagoPeloPar && par ? par.userId : meuId,
      origem: "manual",
    });
    if (!criado) return setErro("O painel ainda está carregando. Tente de novo em instantes.");
    setDescricao("");
    setValor("");
    setCotacaoManual("");
    setErro(null);
  };

  return (
    <form onSubmit={adicionar} className="glass-panel rounded-2xl p-6 space-y-3">
      <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Adicionar gasto</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          aria-label="Descrição"
          placeholder="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          maxLength={120}
          className="glass-input sm:col-span-2"
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label="Valor"
          placeholder="Valor (ex.: 180,00)"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="glass-input"
        />
        <select aria-label="Moeda" value={moeda} onChange={(e) => setMoeda(e.target.value)} className="glass-input">
          {MOEDAS.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo} · {m.nome}
            </option>
          ))}
        </select>
        {moeda !== "BRL" && (
          <label className="sm:col-span-2 text-xs text-[var(--color-muted)]">
            1 {moeda} em reais ({cotacao.estado === "ao-vivo" ? "cotação do dia" : "referência"}; ajuste se a sua foi outra)
            <input
              type="text"
              inputMode="decimal"
              value={cotacaoManual}
              onChange={(e) => setCotacaoManual(e.target.value)}
              placeholder={cotacaoDaMoeda ? cotacaoDaMoeda.toFixed(4).replace(".", ",") : "ex.: 5,43"}
              className="glass-input mt-1"
            />
          </label>
        )}
        <input
          type="date"
          aria-label="Data"
          value={data}
          max={hoje || undefined}
          onChange={(e) => setData(e.target.value)}
          className="glass-input"
        />
        <select aria-label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)} className="glass-input">
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c === "Gasto Pessoal (Fora da Viagem)" ? "Gasto Pessoal (Privado)" : c}
            </option>
          ))}
        </select>
        <select aria-label="Tipo de gasto" value={escopo} onChange={(e) => setEscopo(e.target.value as Escopo)} className="glass-input">
          <option value="viagem_compartilhado">Compartilhar na viagem</option>
          <option value="pessoal_privado">Apenas meu (privado)</option>
        </select>
        {escopo === "viagem_compartilhado" && par && (
          <select
            aria-label="Quem pagou"
            value={pagoPeloPar ? "par" : "eu"}
            onChange={(e) => setPagoPeloPar(e.target.value === "par")}
            className="glass-input"
          >
            <option value="eu">Eu paguei</option>
            <option value="par">{par.nome} pagou</option>
          </select>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {erro}
        </p>
      )}
      <button
        type="submit"
        disabled={!ctx}
        className="inline-flex w-full items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        Registrar lançamento
      </button>
    </form>
  );
}
