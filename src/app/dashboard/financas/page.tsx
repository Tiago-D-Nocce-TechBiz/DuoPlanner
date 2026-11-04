"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  ShieldCheck,
  Layers,
  X,
} from "@/components/ui/icons";
import {
  useDespesas,
  setDespesas as salvarDespesas,
  idAleatorio,
  rotuloCategoria,
  type Categoria,
  type Escopo,
  type ItemDespesa,
} from "@/lib/finance/store";
import { parseValorMonetario } from "@/lib/finance/importar";
import { SmartInvoiceImporter } from "@/components/finance/smart-invoice-importer";
import {
  listarDespesasPersistidas,
  type DespesaPersistida,
} from "@/app/dashboard/financas/invoice-actions";

/**
 * DuoFinance — módulo financeiro do casal com motor avançado de importação de
 * faturas de cartão de crédito.
 *
 * A importação roda no `SmartInvoiceImporter` (motor híbrido em
 * `@/lib/finance/invoice-analyzer` + enriquecimento por IA/dicionário): separa
 * compras à vista e parceladas, limpa o nome das lojas, categoriza e sugere a
 * privacidade. Esta página também permite o lançamento manual e lista os
 * gastos salvos. A lista fica no store compartilhado (`@/lib/finance/store`),
 * então a Nora (agente de IA) e esta página enxergam os mesmos dados.
 */

// Labels sem emoji: os <option> de um <select> nativo não renderizam ícones
// SVG, então mantemos texto puro e monocromático.
const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "Passagens & Transporte", label: "Passagens & Transporte" },
  { value: "Hospedagem", label: "Hospedagem" },
  { value: "Alimentação & Gastronomia", label: "Alimentação & Gastronomia" },
  { value: "Passeios & Lazer", label: "Passeios & Lazer" },
  { value: "Gasto Pessoal (Fora da Viagem)", label: "Gasto Pessoal (Privado)" },
];

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

function outroEscopo(escopo: Escopo): Escopo {
  return escopo === "viagem_compartilhado" ? "pessoal_privado" : "viagem_compartilhado";
}

function BotaoEscopo({ item, onClick }: { item: ItemDespesa; onClick: () => void }) {
  const compartilhado = item.escopo === "viagem_compartilhado";
  return (
    <button
      type="button"
      onClick={onClick}
      title="Alternar entre gasto da viagem e gasto pessoal"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
        compartilhado
          ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
          : "bg-black/5 dark:bg-white/10 text-[var(--color-muted)]"
      }`}
    >
      {compartilhado ? <Users className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      {compartilhado ? "Viagem" : "Pessoal"}
    </button>
  );
}

function BotaoRemover({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--color-heading)] cursor-pointer transition-colors"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

export default function FinancasPage() {
  // Lista vem do store compartilhado (reativo): a Nora e esta página
  // escrevem/leem o mesmo localStorage e todas as telas se atualizam.
  const despesas = useDespesas();
  const [aba, setAba] = useState<"compartilhado" | "privado">("compartilhado");
  const [removido, setRemovido] = useState<{ item: ItemDespesa; indice: number } | null>(null);

  // Gastos persistidos no Supabase (importações de fatura do DuoFinance).
  // Carregados após a montagem (setState em .then passa no react-hooks) e
  // recarregados quando o importador salva algo novo.
  const [persistidas, setPersistidas] = useState<DespesaPersistida[] | null>(null);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    let ativo = true;
    listarDespesasPersistidas()
      .then((res) => {
        if (ativo && res.ok) setPersistidas(res.itens);
      })
      .catch(() => {
        /* degrada em silêncio: a lista local continua visível */
      });
    return () => {
      ativo = false;
    };
  }, [recarregar]);

  const [tituloManual, setTituloManual] = useState("");
  const [valorManual, setValorManual] = useState("");
  const [erroManual, setErroManual] = useState<string | null>(null);
  const [categoriaManual, setCategoriaManual] = useState<Categoria>("Alimentação & Gastronomia");
  const [escopoManual, setEscopoManual] = useState<Escopo>("viagem_compartilhado");

  const alternarEscopoSalvo = (id: string) =>
    salvarDespesas(
      despesas.map((item) => (item.id === id ? { ...item, escopo: outroEscopo(item.escopo) } : item))
    );

  const removerSalvo = (id: string) => {
    const indice = despesas.findIndex((item) => item.id === id);
    if (indice < 0) return;
    setRemovido({ item: despesas[indice], indice });
    salvarDespesas(despesas.filter((item) => item.id !== id));
  };

  const desfazerRemocao = () => {
    if (!removido) return;
    const lista = [...despesas];
    lista.splice(Math.min(removido.indice, lista.length), 0, removido.item);
    salvarDespesas(lista);
    setRemovido(null);
  };

  const adicionarDespesaManual = (e: React.FormEvent) => {
    e.preventDefault();
    const valorNum = parseValorMonetario(valorManual);
    if (!tituloManual.trim()) {
      setErroManual("Informe uma descrição.");
      return;
    }
    if (valorNum === null || valorNum <= 0) {
      setErroManual("Valor inválido. Use, por exemplo, 180,00 ou 1.250,90.");
      return;
    }
    const nova: ItemDespesa = {
      id: idAleatorio(),
      data: new Date().toLocaleDateString("pt-BR"),
      estabelecimento: tituloManual.trim(),
      valor: valorNum,
      categoriaDestino: categoriaManual,
      escopo: escopoManual,
      origem: "Manual",
    };
    salvarDespesas([nova, ...despesas]);
    setTituloManual("");
    setValorManual("");
    setErroManual(null);
  };

  const compartilhados = despesas.filter((d) => d.escopo === "viagem_compartilhado");
  const privados = despesas.filter((d) => d.escopo === "pessoal_privado");
  const totalCompartilhado = compartilhados.reduce((a, i) => a + i.valor, 0);
  const totalPrivado = privados.reduce((a, i) => a + i.valor, 0);
  const lista = aba === "compartilhado" ? compartilhados : privados;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          DuoFinance
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)] max-w-2xl">
          O módulo financeiro do casal. Importe a fatura do cartão para ver tudo separado — à vista, parcelado e por categoria — ou lance manualmente. Só os gastos compartilhados entram na divisão da dupla; os pessoais ficam privados.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Total da viagem (compartilhado)
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(totalCompartilhado)}</p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">Visível para as duas contas</span>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Sua parte (50%)
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(totalCompartilhado / 2)}</p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">Divisão igual dos itens da viagem</span>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Seus gastos pessoais
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(totalPrivado)}</p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">Privado: nunca entra na divisão</span>
        </div>
      </div>

      {/* Motor avançado de importação de faturas */}
      <SmartInvoiceImporter onSalvo={() => setRecarregar((n) => n + 1)} />

      {/* Lançar manual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={adicionarDespesaManual} className="glass-panel rounded-2xl p-6 space-y-4">
          <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Adicionar gasto manualmente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Descrição"
              value={tituloManual}
              onChange={(e) => setTituloManual(e.target.value)}
              className="glass-input"
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Valor R$ (ex.: 180,00)"
              value={valorManual}
              onChange={(e) => setValorManual(e.target.value)}
              className="glass-input"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={categoriaManual} onChange={(e) => setCategoriaManual(e.target.value as Categoria)} className="glass-input">
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select value={escopoManual} onChange={(e) => setEscopoManual(e.target.value as Escopo)} className="glass-input">
              <option value="viagem_compartilhado">Compartilhar na viagem</option>
              <option value="pessoal_privado">Apenas meu (privado)</option>
            </select>
          </div>
          {erroManual && (
            <p role="alert" className="text-xs text-[var(--color-danger)]">
              {erroManual}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Registrar lançamento
          </button>
        </form>
      </div>

      {/* Gastos salvos na nuvem (importações de fatura, sincronizados na dupla) */}
      {persistidas && persistidas.length > 0 && (
        <div className="glass-panel rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">
                Gastos salvos no DuoFinance
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Sincronizados no espaço da dupla — visíveis para as duas contas (os privados, só para você).
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-[var(--color-muted)] dark:bg-white/10">
              {persistidas.length} {persistidas.length === 1 ? "gasto" : "gastos"}
            </span>
          </div>
          <div className="space-y-2.5">
            {persistidas.map((d) => (
              <div
                key={d.id}
                className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-[var(--color-heading)]">
                    {d.estabelecimento}
                    {d.oQueFoiGasto ? (
                      <span className="font-normal text-[var(--color-muted)]"> — {d.oQueFoiGasto}</span>
                    ) : null}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-muted)]">
                    <span>{d.data ? d.data.split("-").reverse().join("/") : "sem data"}</span>
                    <span>• {d.categoria}</span>
                    {d.ehParcelado && d.parcelaAtual && d.totalParcelas ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-2 py-0.5 font-semibold text-[var(--color-accent-foreground)]">
                        <Layers className="h-3 w-3" />
                        {String(d.parcelaAtual).padStart(2, "0")}/{String(d.totalParcelas).padStart(2, "0")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="font-serif text-sm font-bold text-[var(--color-heading)]">{brl(d.valor)}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      d.escopo === "viagem_compartilhado"
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                        : "bg-black/5 text-[var(--color-muted)] dark:bg-white/10"
                    }`}
                  >
                    {d.escopo === "viagem_compartilhado" ? (
                      <Users className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    {d.escopo === "viagem_compartilhado" ? "Compartilhado" : "Privado"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de despesas (lançamentos manuais e da Nora, neste dispositivo) */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setAba("compartilhado")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              aba === "compartilhado" ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "glass-panel text-[var(--color-muted)]"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              Compartilhados ({compartilhados.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAba("privado")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              aba === "privado" ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "glass-panel text-[var(--color-muted)]"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              Pessoais ({privados.length})
            </span>
          </button>
        </div>

        {removido && (
          <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-xs text-[var(--color-muted)]">
            <span className="min-w-0 truncate">“{removido.item.estabelecimento}” foi removido.</span>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={desfazerRemocao} className="font-semibold text-[var(--color-heading)] underline underline-offset-2 cursor-pointer">
                Desfazer
              </button>
              <BotaoRemover rotulo="Fechar aviso" onClick={() => setRemovido(null)} />
            </div>
          </div>
        )}

        {lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            Nenhum gasto {aba === "compartilhado" ? "da viagem" : "pessoal"} ainda. Importe uma fatura ou adicione um lançamento.
          </p>
        ) : (
          <div className="space-y-3">
            {lista.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--color-border)] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-heading)] break-words">{item.estabelecimento}</p>
                  <p className="text-xs text-[var(--color-muted)]">{item.data} • {rotuloCategoria(item)}</p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <span className="font-serif text-base font-bold text-[var(--color-heading)]">{brl(item.valor)}</span>
                  <BotaoEscopo item={item} onClick={() => alternarEscopoSalvo(item.id)} />
                  <BotaoRemover rotulo={`Remover ${item.estabelecimento}`} onClick={() => removerSalvo(item.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
