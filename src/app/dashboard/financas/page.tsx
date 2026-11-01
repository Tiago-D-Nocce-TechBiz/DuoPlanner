"use client";

import { useState } from "react";
import {
  Users,
  ScanLine,
  PenLine,
  Plus,
  CheckCircle2,
  ShieldCheck,
  X,
} from "@/components/ui/icons";
import {
  useDespesas,
  setDespesas as salvarDespesas,
  classificarItemAutomaticamente,
  idAleatorio,
  rotuloCategoria,
  type Categoria,
  type Escopo,
  type ItemDespesa,
} from "@/lib/finance/store";
import {
  importarExtrato,
  parseValorMonetario,
  type FormatoExtrato,
  type LinhaIgnorada,
} from "@/lib/finance/importar";
import { isoToBR, todayInSaoPaulo } from "@/lib/dates";

/**
 * Finanças Duo — controle de gastos da viagem com triagem de privacidade.
 *
 * Importa uma fatura de cartão ou extrato de conta (CSV/TXT) ou texto colado
 * (`@/lib/finance/importar`), classifica os itens por categoria e separa o
 * que é da viagem (compartilhado) do que é pessoal (privado, nunca entra na
 * divisão da dupla). A lista fica no store compartilhado
 * (`@/lib/finance/store`), então a Nora (agente de IA) e esta página
 * enxergam os mesmos dados.
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

const DESCRICAO_FORMATO: Record<FormatoExtrato, string> = {
  cartao: "Fatura de cartão: compras entram; pagamentos e estornos ficam de fora.",
  conta: "Extrato de conta: as saídas (valores negativos) entram como gastos; entradas ficam de fora.",
  texto: "Texto colado: um lançamento por linha, com o valor no fim.",
};

const TAMANHO_MAXIMO_ARQUIVO = 2 * 1024 * 1024;

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

function outroEscopo(escopo: Escopo): Escopo {
  return escopo === "viagem_compartilhado" ? "pessoal_privado" : "viagem_compartilhado";
}

/** Lê o arquivo como UTF-8 e, se vier com caracteres inválidos, como Windows-1252
 * (muitos bancos exportam CSV nessa codificação). */
async function lerArquivoComoTexto(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return utf8;
  }
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
  const [itensTriagem, setItensTriagem] = useState<ItemDespesa[]>([]);
  const [ignoradas, setIgnoradas] = useState<LinhaIgnorada[]>([]);
  const [formato, setFormato] = useState<FormatoExtrato | null>(null);
  const [avisoImportacao, setAvisoImportacao] = useState<string | null>(null);
  const [textoColado, setTextoColado] = useState("");
  const [aba, setAba] = useState<"compartilhado" | "privado">("compartilhado");
  const [removido, setRemovido] = useState<{ item: ItemDespesa; indice: number } | null>(null);

  const [tituloManual, setTituloManual] = useState("");
  const [valorManual, setValorManual] = useState("");
  const [erroManual, setErroManual] = useState<string | null>(null);
  const [categoriaManual, setCategoriaManual] = useState<Categoria>("Alimentação & Gastronomia");
  const [escopoManual, setEscopoManual] = useState<Escopo>("viagem_compartilhado");

  const handleUploadFatura = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > TAMANHO_MAXIMO_ARQUIVO) {
      setAvisoImportacao("Arquivo grande demais (máximo de 2 MB). Exporte só o período da viagem.");
      return;
    }
    extrairDoTexto(await lerArquivoComoTexto(file));
  };

  // Lê CSV de cartão/conta ou texto livre (um lançamento por linha).
  const extrairDoTexto = (texto: string) => {
    const resultado = importarExtrato(texto, todayInSaoPaulo());
    const itens = resultado.itens.map((l) =>
      classificarItemAutomaticamente(l.titulo, l.valor, isoToBR(l.dataIso), "Importado", l.categoriaBanco)
    );
    setItensTriagem(itens);
    setIgnoradas(resultado.ignoradas);
    setFormato(resultado.formato);
    setAvisoImportacao(
      itens.length === 0 && resultado.ignoradas.length === 0
        ? "Nenhum lançamento encontrado. Use uma linha por gasto, com o valor no fim (ex.: Jantar R$ 120,00)."
        : null
    );
    if (itens.length > 0) setTextoColado("");
  };

  const limparTriagem = () => {
    setItensTriagem([]);
    setIgnoradas([]);
    setFormato(null);
  };

  const alternarEscopoTriagem = (id: string) =>
    setItensTriagem((prev) =>
      prev.map((item) => (item.id === id ? { ...item, escopo: outroEscopo(item.escopo) } : item))
    );

  const removerDaTriagem = (id: string) =>
    setItensTriagem((prev) => prev.filter((item) => item.id !== id));

  const confirmarTriagem = () => {
    salvarDespesas([...itensTriagem, ...despesas]);
    limparTriagem();
  };

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
  const triagemAberta = itensTriagem.length > 0 || ignoradas.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Finanças Duo
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)] max-w-2xl">
          Controle os gastos da viagem a dois. Importe uma fatura ou lance manualmente — apenas os gastos marcados como da viagem são compartilhados; os pessoais ficam privados.
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

      {/* Importar + Lançar manual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Importar fatura ou extrato</h2>
            <p className="mt-1.5 text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
              Envie o CSV/TXT da fatura do cartão ou do extrato da conta, ou cole o texto. Você revisa a triagem antes de confirmar.
            </p>
          </div>

          <div className="mt-5">
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer hover:opacity-90 transition-opacity">
              <ScanLine className="h-4 w-4" />
              Selecionar arquivo (CSV / TXT)
              <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleUploadFatura} className="hidden" />
            </label>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
              Ou cole o texto da fatura
            </label>
            <textarea
              value={textoColado}
              onChange={(e) => setTextoColado(e.target.value)}
              rows={3}
              placeholder={"Um lançamento por linha. Ex.:\n05/10 Restaurante na orla  R$ 120,00"}
              className="glass-input resize-none font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => extrairDoTexto(textoColado)}
              disabled={!textoColado.trim()}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer disabled:opacity-50"
            >
              <PenLine className="h-4 w-4" />
              Ler texto colado
            </button>
            {avisoImportacao && (
              <p role="status" className="mt-2 text-xs text-[var(--color-muted)]">
                {avisoImportacao}
              </p>
            )}
          </div>
        </div>

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

      {/* Triagem de privacidade (aparece ao importar) */}
      {triagemAberta && (
        <div className="glass-panel rounded-2xl p-6 ring-1 ring-[var(--color-border-strong)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="font-serif text-xl font-bold text-[var(--color-heading)]">Revisar antes de salvar</h3>
              <p className="text-xs text-[var(--color-muted)]">
                {formato ? `${DESCRICAO_FORMATO[formato]} ` : ""}
                Toque no status para alternar entre compartilhado e pessoal.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={limparTriagem} className="px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel cursor-pointer">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarTriagem}
                disabled={itensTriagem.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirmar{itensTriagem.length > 0 ? ` (${itensTriagem.length})` : ""}
              </button>
            </div>
          </div>

          {itensTriagem.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">Nenhum gasto reconhecido neste arquivo.</p>
          ) : (
            <div className="space-y-2.5">
              {itensTriagem.map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--color-border)] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-heading)] break-words">{item.estabelecimento}</p>
                    <p className="text-xs text-[var(--color-muted)]">{item.data} • {rotuloCategoria(item)}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="font-serif font-bold text-sm text-[var(--color-heading)]">{brl(item.valor)}</span>
                    <BotaoEscopo item={item} onClick={() => alternarEscopoTriagem(item.id)} />
                    <BotaoRemover rotulo={`Não importar ${item.estabelecimento}`} onClick={() => removerDaTriagem(item.id)} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {ignoradas.length > 0 && (
            <details className="mt-5 rounded-xl border border-[var(--color-border)] px-4 py-3">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--color-muted)]">
                {ignoradas.length === 1 ? "1 linha não importada" : `${ignoradas.length} linhas não importadas`}
              </summary>
              <ul className="mt-3 space-y-1.5">
                {ignoradas.map((l) => (
                  <li key={l.linha} className="text-xs text-[var(--color-muted)]">
                    <span className="font-semibold text-[var(--color-heading)]">Linha {l.linha}:</span>{" "}
                    {l.motivo} — <span className="font-mono break-all">{l.texto}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Lista de despesas */}
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
