"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  ScanLine,
  PenLine,
  Plus,
  CheckCircle2,
  ShieldCheck,
  X,
  Handshake,
} from "@/components/ui/icons";
import { ReceiptScanner, type GastoDoRecibo } from "@/components/financas/receipt-scanner";
import {
  useDespesas,
  classificarItemAutomaticamente,
  criarDespesa,
  atualizarDespesa,
  removerDespesa,
  restaurarDespesa,
  resumirDespesas,
  rotuloCategoria,
  type Categoria,
  type Despesa,
  type Escopo,
  type ItemDespesa,
} from "@/lib/finance/store";
import { CATEGORIAS } from "@/lib/finance/classificar";
import {
  importarExtrato,
  parseValorMonetario,
  type FormatoExtrato,
  type LinhaIgnorada,
} from "@/lib/finance/importar";
import { valorEmReais } from "@/lib/finance/acerto";
import { formatarMoeda, MOEDAS, useCotacoes } from "@/lib/cambio/use-cotacoes";
import { isoToBR, todayInSaoPaulo } from "@/lib/dates";
import { useHoje } from "@/lib/local-store";
import { useContextoSync } from "@/lib/sync/motor";

/**
 * Finanças Duo — gastos da viagem a dois, sincronizados entre o casal.
 *
 * Cada gasto é salvo no Postgres (fila offline + Realtime): o que é marcado
 * como da viagem aparece na hora para o par e entra no Acerto de Contas; o
 * pessoal fica privado (a RLS não o entrega ao par). Entradas: recibo/Pix lido
 * pela IA (com confirmação), fatura/extrato (com triagem) ou lançamento manual.
 */

const DESCRICAO_FORMATO: Record<FormatoExtrato, string> = {
  cartao: "Fatura de cartão: compras entram; pagamentos e estornos ficam de fora.",
  conta: "Extrato de conta: as saídas (valores negativos) entram como gastos; entradas ficam de fora.",
  texto: "Texto colado: um lançamento por linha, com o valor no fim.",
};

const TAMANHO_MAXIMO_ARQUIVO = 2 * 1024 * 1024;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function outroEscopo(escopo: Escopo): Escopo {
  return escopo === "viagem_compartilhado" ? "pessoal_privado" : "viagem_compartilhado";
}

function brParaIso(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : todayInSaoPaulo();
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

function BotaoEscopo({ escopo, onClick, desabilitado }: { escopo: Escopo; onClick: () => void; desabilitado?: boolean }) {
  const compartilhado = escopo === "viagem_compartilhado";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      title={desabilitado ? "Só quem lançou pode mudar o tipo" : "Alternar entre gasto da viagem e gasto pessoal"}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all disabled:cursor-default disabled:opacity-80 ${
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

const ROTULO_ORIGEM: Partial<Record<Despesa["origem"], string>> = {
  recibo: "Recibo",
  nora: "Nora",
  importacao: "Fatura",
  legado: "Importado do navegador",
};

export default function FinancasPage() {
  const despesas = useDespesas();
  const ctx = useContextoSync();
  const { taxas, cotacao } = useCotacoes();
  const hoje = useHoje();
  const meuId = ctx?.userId ?? null;
  const par = ctx?.membros.find((m) => m.userId !== meuId) ?? null;
  const nomeDe = (id: string | null) =>
    id === meuId ? "você" : ctx?.membros.find((m) => m.userId === id)?.nome ?? "seu par";

  const [itensTriagem, setItensTriagem] = useState<ItemDespesa[]>([]);
  const [ignoradas, setIgnoradas] = useState<LinhaIgnorada[]>([]);
  const [formato, setFormato] = useState<FormatoExtrato | null>(null);
  const [avisoImportacao, setAvisoImportacao] = useState<string | null>(null);
  const [textoColado, setTextoColado] = useState("");
  const [aba, setAba] = useState<"compartilhado" | "privado">("compartilhado");
  const [removido, setRemovido] = useState<Despesa | null>(null);

  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [moeda, setMoeda] = useState("BRL");
  const [cotacaoManual, setCotacaoManual] = useState("");
  const [data, setData] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("Alimentação & Gastronomia");
  const [escopo, setEscopo] = useState<Escopo>("viagem_compartilhado");
  const [pagoPeloPar, setPagoPeloPar] = useState(false);
  const [erroManual, setErroManual] = useState<string | null>(null);

  const resumo = useMemo(() => resumirDespesas(despesas, ctx), [despesas, ctx]);
  const compartilhados = useMemo(
    () => despesas.filter((d) => d.escopo === "viagem_compartilhado" && d.tipo === "gasto").sort(porData),
    [despesas]
  );
  const privados = useMemo(
    () => despesas.filter((d) => d.escopo === "pessoal_privado" && d.userId === meuId).sort(porData),
    [despesas, meuId]
  );
  const lista = aba === "compartilhado" ? compartilhados : privados;
  const triagemAberta = itensTriagem.length > 0 || ignoradas.length > 0;
  const semContexto = !ctx;
  const cotacaoDaMoeda = moeda === "BRL" ? 1 : taxas[moeda];

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

  const confirmarTriagem = () => {
    for (const item of itensTriagem) {
      criarDespesa({
        descricao: item.estabelecimento,
        valor: item.valor,
        data: brParaIso(item.data),
        categoria: item.categoriaDestino,
        escopo: item.escopo,
        origem: "importacao",
      });
    }
    limparTriagem();
  };

  const confirmarRecibo = (g: GastoDoRecibo) => {
    criarDespesa({
      descricao: g.descricao,
      valor: g.valor,
      moeda: g.moeda,
      cotacaoBrl: g.cotacaoBrl,
      data: g.data,
      categoria: g.categoria,
      escopo: g.escopo,
      origem: "recibo",
    });
  };

  const removerSalvo = (d: Despesa) => {
    setRemovido(d);
    removerDespesa(d.id);
  };

  const desfazerRemocao = () => {
    if (!removido) return;
    restaurarDespesa(removido);
    setRemovido(null);
  };

  const adicionarManual = (e: React.FormEvent) => {
    e.preventDefault();
    const valorNum = parseValorMonetario(valor);
    if (!descricao.trim()) return setErroManual("Informe uma descrição.");
    if (valorNum === null || valorNum <= 0) return setErroManual("Valor inválido. Use, por exemplo, 180,00 ou 1.250,90.");
    let cotacaoUsada: number | null = null;
    if (moeda !== "BRL") {
      cotacaoUsada = cotacaoManual ? parseValorMonetario(cotacaoManual) : cotacaoDaMoeda ?? null;
      if (!cotacaoUsada || cotacaoUsada <= 0) return setErroManual(`Informe quanto vale 1 ${moeda} em reais.`);
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
    if (!criado) return setErroManual("O painel ainda está carregando. Tente de novo em instantes.");
    setDescricao("");
    setValor("");
    setCotacaoManual("");
    setErroManual(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">Finanças Duo</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)] max-w-2xl">
            Os gastos marcados como da viagem aparecem na hora para vocês dois e entram no acerto; os pessoais ficam privados.
          </p>
        </div>
        <Link
          href="/dashboard/acerto"
          className="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Handshake className="h-4 w-4" />
          Acerto de contas
        </Link>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Total da viagem</span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(resumo.totalCompartilhado)}</p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">Compartilhado: visível para os dois</span>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Sua parte</span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(resumo.suaParte)}</p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">{resumo.regra}</span>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Seus gastos pessoais
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-heading)]">{brl(resumo.totalPrivado)}</p>
          <span className="mt-1 block text-xs text-[var(--color-muted)]">Privado: nunca entra na divisão</span>
        </div>
      </div>

      <ReceiptScanner onConfirmar={confirmarRecibo} taxas={taxas} />

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
            <label htmlFor="texto-fatura" className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
              Ou cole o texto da fatura
            </label>
            <textarea
              id="texto-fatura"
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
              <p role="status" className="mt-2 text-xs text-[var(--color-muted)]">{avisoImportacao}</p>
            )}
          </div>
        </div>

        <form onSubmit={adicionarManual} className="glass-panel rounded-2xl p-6 space-y-3">
          <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Adicionar gasto</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" aria-label="Descrição" placeholder="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={120} className="glass-input sm:col-span-2" />
            <input type="text" inputMode="decimal" aria-label="Valor" placeholder="Valor (ex.: 180,00)" value={valor} onChange={(e) => setValor(e.target.value)} className="glass-input" />
            <select aria-label="Moeda" value={moeda} onChange={(e) => setMoeda(e.target.value)} className="glass-input">
              {MOEDAS.map((m) => (
                <option key={m.codigo} value={m.codigo}>{m.codigo} · {m.nome}</option>
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
            <input type="date" aria-label="Data" value={data} max={hoje || undefined} onChange={(e) => setData(e.target.value)} className="glass-input" />
            <select aria-label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)} className="glass-input">
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c === "Gasto Pessoal (Fora da Viagem)" ? "Gasto Pessoal (Privado)" : c}</option>
              ))}
            </select>
            <select aria-label="Tipo de gasto" value={escopo} onChange={(e) => setEscopo(e.target.value as Escopo)} className="glass-input">
              <option value="viagem_compartilhado">Compartilhar na viagem</option>
              <option value="pessoal_privado">Apenas meu (privado)</option>
            </select>
            {escopo === "viagem_compartilhado" && par && (
              <select aria-label="Quem pagou" value={pagoPeloPar ? "par" : "eu"} onChange={(e) => setPagoPeloPar(e.target.value === "par")} className="glass-input">
                <option value="eu">Eu paguei</option>
                <option value="par">{par.nome} pagou</option>
              </select>
            )}
          </div>
          {erroManual && <p role="alert" className="text-xs text-[var(--color-danger)]">{erroManual}</p>}
          <button
            type="submit"
            disabled={semContexto}
            className="inline-flex w-full items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
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
                disabled={itensTriagem.length === 0 || semContexto}
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
                    <BotaoEscopo
                      escopo={item.escopo}
                      onClick={() =>
                        setItensTriagem((prev) => prev.map((i) => (i.id === item.id ? { ...i, escopo: outroEscopo(i.escopo) } : i)))
                      }
                    />
                    <BotaoRemover
                      rotulo={`Não importar ${item.estabelecimento}`}
                      onClick={() => setItensTriagem((prev) => prev.filter((i) => i.id !== item.id))}
                    />
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
                    <span className="font-semibold text-[var(--color-heading)]">Linha {l.linha}:</span> {l.motivo} —{" "}
                    <span className="font-mono break-all">{l.texto}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Lista de despesas */}
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

        {removido && (
          <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-xs text-[var(--color-muted)]">
            <span className="min-w-0 truncate">“{removido.descricao}” foi removido.</span>
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
            Nenhum gasto {aba === "compartilhado" ? "da viagem" : "pessoal"} ainda. Leia um recibo, importe uma fatura ou adicione um lançamento.
          </p>
        ) : (
          <ul className="space-y-3">
            {lista.map((d) => {
              const meu = d.userId === meuId;
              const emReais = valorEmReais(d);
              const origem = ROTULO_ORIGEM[d.origem];
              return (
                <li key={d.id} className="rounded-xl border border-[var(--color-border)] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-heading)] break-words">{d.descricao}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {isoToBR(d.data)} • {rotuloCategoria(d)}
                      {d.escopo === "viagem_compartilhado" && ` • pago por ${nomeDe(d.pagoPor ?? d.userId)}`}
                      {origem && ` • ${origem}`}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-right">
                      <span className="block font-serif text-base font-bold text-[var(--color-heading)]">{formatarMoeda(d.valor, d.moeda)}</span>
                      {d.moeda !== "BRL" && emReais !== null && (
                        <span className="block text-[11px] text-[var(--color-muted)]">≈ {brl(emReais)}</span>
                      )}
                    </span>
                    <BotaoEscopo
                      escopo={d.escopo}
                      desabilitado={!meu}
                      onClick={() => atualizarDespesa(d.id, { escopo: outroEscopo(d.escopo) })}
                    />
                    <BotaoRemover rotulo={`Remover ${d.descricao}`} onClick={() => removerSalvo(d)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function porData(a: Despesa, b: Despesa): number {
  return b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm);
}
