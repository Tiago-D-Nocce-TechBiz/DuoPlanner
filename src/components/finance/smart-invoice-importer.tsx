"use client";

import { useMemo, useState } from "react";
import {
  Upload,
  PenLine,
  Loader2,
  CheckCircle2,
  Users,
  Lock,
  Layers,
  Filter,
  ChevronDown,
  Wallet,
  Coins,
  TrendingUp,
  ScanLine,
  Sparkles,
} from "@/components/ui/icons";
import { CategoryIcon, COR_CATEGORIA } from "@/components/finance/category-icon";
import { todayInSaoPaulo } from "@/lib/dates";
import {
  analisarFatura,
  calcularRaioX,
  categoriaParaStore,
  escopoParaStore,
  mesclarEnriquecimento,
  CATEGORIAS_DUOFINANCE,
  ICONE_POR_CATEGORIA,
  type CategoriaDuoFinance,
  type EscopoSugerido,
  type TransacaoAnalisada,
} from "@/lib/finance/invoice-analyzer";
import {
  enriquecerTransacoes,
  type TransacaoParaEnriquecer,
} from "@/app/dashboard/financas/analyze-invoice";
import { criarDespesa } from "@/lib/finance/store";
import type { LinhaIgnorada } from "@/lib/finance/importar";
import { useContextoSync } from "@/lib/sync/motor";

/* --------------------------------- Utils --------------------------------- */

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const TAMANHO_MAXIMO_ARQUIVO = 2 * 1024 * 1024;

/** Lê o arquivo como UTF-8 e, se vier com caracteres inválidos, Windows-1252. */
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

type Etapa = "importar" | "analisando" | "revisar";
type Aba = "todos" | "avista" | "parcelados";

const PASSOS_ANALISE = [
  "Lendo transações…",
  "Separando compras à vista e parceladas…",
  "Identificando estabelecimentos e categorias…",
];

/* ------------------------------ Componente ------------------------------- */

export function SmartInvoiceImporter() {
  const ctx = useContextoSync();
  const [etapa, setEtapa] = useState<Etapa>("importar");
  const [passoAnalise, setPassoAnalise] = useState(0);
  const [transacoes, setTransacoes] = useState<TransacaoAnalisada[]>([]);
  const [ignoradas, setIgnoradas] = useState<LinhaIgnorada[]>([]);
  const [faturaReferencia, setFaturaReferencia] = useState("");
  const [textoColado, setTextoColado] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [fonteIA, setFonteIA] = useState<"ia" | "dicionario" | null>(null);

  const [aba, setAba] = useState<Aba>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaDuoFinance | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  /** Quantos gastos entraram na fila e em qual espaço (null = sem casal ainda). */
  const [salvo, setSalvo] = useState<{ quantidade: number; espaco: string | null } | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const raioX = useMemo(() => calcularRaioX(transacoes), [transacoes]);

  /* ---- Importação ---- */

  async function processar(texto: string) {
    const base = analisarFatura(texto, todayInSaoPaulo());
    if (base.transacoes.length === 0) {
      setAviso(
        base.ignoradas.length > 0
          ? "Nenhuma compra reconhecida — só pagamentos, estornos ou linhas de saldo."
          : "Nenhum lançamento encontrado. Envie o CSV da fatura ou cole uma linha por gasto."
      );
      return;
    }
    setAviso(null);
    setEtapa("analisando");
    setPassoAnalise(0);
    setTransacoes(base.transacoes);
    setIgnoradas(base.ignoradas);
    setFaturaReferencia(base.faturaReferencia);

    // Feedback por etapas enquanto a IA/dicionário classifica.
    const t1 = setTimeout(() => setPassoAnalise(1), 450);
    const t2 = setTimeout(() => setPassoAnalise(2), 950);

    // Tetos iguais aos da validação do servidor (linhas longas não derrubam o lote).
    const entrada: TransacaoParaEnriquecer[] = base.transacoes.map((t) => ({
      id: t.id,
      descricaoOriginal: t.descricaoOriginal.slice(0, 300),
      cleanMerchantName: t.cleanMerchantName.slice(0, 120),
      valor: t.valor,
      moeda: t.moeda,
    }));

    try {
      const resposta = await enriquecerTransacoes(entrada);
      const enriquecidas = mesclarEnriquecimento(base.transacoes, resposta.itens, resposta.fonte);
      setTransacoes(enriquecidas);
      setFonteIA(resposta.fonte);
      if (resposta.aviso) setAviso(resposta.aviso);
    } catch {
      // mesclarEnriquecimento já foi aplicado via dicionário no servidor; se
      // nem isso veio, mantém a classificação local do passo determinístico.
      setFonteIA("dicionario");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setEtapa("revisar");
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > TAMANHO_MAXIMO_ARQUIVO) {
      setAviso("Arquivo grande demais (máximo de 2 MB). Exporte um mês por vez.");
      return;
    }
    await processar(await lerArquivoComoTexto(file));
  }

  function reiniciar() {
    setEtapa("importar");
    setTransacoes([]);
    setIgnoradas([]);
    setFaturaReferencia("");
    setTextoColado("");
    setAviso(null);
    setFonteIA(null);
    setAba("todos");
    setFiltroCategoria(null);
    setSelecionados(new Set());
    setSalvo(null);
    setErroSalvar(null);
  }

  /* ---- Edição em linha ---- */

  function trocarCategoria(id: string, category: CategoriaDuoFinance) {
    setTransacoes((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, category, categoryIcon: ICONE_POR_CATEGORIA[category] } : t
      )
    );
  }

  function trocarEscopo(id: string, suggestedScope: EscopoSugerido) {
    setTransacoes((prev) => prev.map((t) => (t.id === id ? { ...t, suggestedScope } : t)));
  }

  function alternarSelecionado(id: string) {
    setSelecionados((prev) => {
      const prox = new Set(prev);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });
  }

  function marcarSelecionadosComo(scope: EscopoSugerido) {
    if (selecionados.size === 0) return;
    setTransacoes((prev) =>
      prev.map((t) => (selecionados.has(t.id) ? { ...t, suggestedScope: scope } : t))
    );
    setSelecionados(new Set());
  }

  /* ---- Confirmação: grava em despesas_viagem pela fila de sincronização ---- */

  // Mesmo caminho dos demais gastos: fila persistida (sobrevive a ficar
  // offline), RLS por espaço e escopo, Realtime para o par e entrada no
  // acerto. O servidor valida cada linha e tira user_id/workspace_id da sessão.
  function confirmar() {
    const aSalvar = transacoes.filter((t) => !t.ignorarNoCalculo);
    if (aSalvar.length === 0) return;
    if (!ctx) {
      setErroSalvar("O painel ainda está carregando. Tente de novo em instantes.");
      return;
    }
    let quantidade = 0;
    for (const t of aSalvar) {
      const parcela = t.installmentInfo;
      const criado = criarDespesa({
        descricao: t.cleanMerchantName,
        valor: t.valor,
        moeda: t.moeda,
        data: /^\d{4}-\d{2}-\d{2}$/.test(t.dataIso) ? t.dataIso : undefined,
        categoria: categoriaParaStore(t.category),
        escopo: escopoParaStore(t.suggestedScope),
        origem: "importacao",
        fatura: {
          oQueFoiGasto: t.whatWasBought,
          categoriaDetalhada: t.category,
          parcela: parcela.isInstallment
            ? { atual: parcela.currentInstallment, total: parcela.totalInstallments }
            : null,
          referencia: faturaReferencia,
        },
      });
      if (criado) quantidade++;
    }
    setErroSalvar(null);
    setSalvo({ quantidade, espaco: ctx.workspace?.nome ?? null });
  }

  /* ---- Render ---- */

  const listaFiltrada = useMemo(() => {
    let l = transacoes;
    if (aba === "avista") l = l.filter((t) => !t.installmentInfo.isInstallment);
    if (aba === "parcelados") l = l.filter((t) => t.installmentInfo.isInstallment);
    if (filtroCategoria) l = l.filter((t) => t.category === filtroCategoria);
    return l;
  }, [transacoes, aba, filtroCategoria]);

  if (salvo !== null) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--color-accent)]" />
        <h3 className="mt-3 font-serif text-2xl font-bold text-[var(--color-heading)]">
          {salvo.quantidade} {salvo.quantidade === 1 ? "gasto salvo" : "gastos salvos"} no DuoFinance
        </h3>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          {salvo.espaco
            ? `Salvos no espaço “${salvo.espaco}”. Os compartilhados aparecem para as duas contas e entram no acerto; os privados ficam só com você.`
            : "Salvos como gastos pessoais. Convide sua dupla para dividir os gastos da viagem."}
        </p>
        <button
          type="button"
          onClick={reiniciar}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-xs font-semibold text-[var(--color-accent-foreground)]"
        >
          <ScanLine className="h-4 w-4" />
          Importar outra fatura
        </button>
      </div>
    );
  }

  if (etapa === "importar") {
    return (
      <div className="glass-panel rounded-2xl p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="font-serif text-2xl font-bold text-[var(--color-heading)]">
            Importar fatura do cartão
          </h2>
          <p className="mt-1.5 text-sm text-[var(--color-muted)] max-w-2xl">
            Envie o CSV da fatura (Nubank, Inter, Itaú, C6, XP, Santander), um TXT ou cole o texto.
            O DuoFinance separa compras à vista e parceladas, limpa o nome das lojas e categoriza tudo
            para você revisar antes de salvar.
          </p>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--color-border-strong)] px-6 py-10 text-center transition-colors hover:border-[var(--color-accent)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
          <Upload className="h-8 w-8 text-[var(--color-accent)]" />
          <span className="text-sm font-semibold text-[var(--color-heading)]">
            Arraste o arquivo aqui ou clique para selecionar
          </span>
          <span className="text-xs text-[var(--color-muted)]">CSV ou TXT, até 2 MB (um mês por arquivo)</span>
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={handleUpload}
            className="hidden"
          />
        </label>

        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Ou cole o texto da fatura
          </label>
          <textarea
            value={textoColado}
            onChange={(e) => setTextoColado(e.target.value)}
            rows={4}
            placeholder={"Uma linha por compra. Ex.:\n05/10 PG *UBER *TRIP  23,45\n10/10 MAGAZINE LUIZA PARC 02/10  120,00"}
            className="glass-input resize-none font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => processar(textoColado)}
            disabled={!textoColado.trim()}
            className="mt-2 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold glass-panel cursor-pointer disabled:opacity-50"
          >
            <PenLine className="h-4 w-4" />
            Analisar texto colado
          </button>
        </div>

        {aviso && (
          <p role="status" className="mt-3 text-xs text-[var(--color-muted)]">
            {aviso}
          </p>
        )}
      </div>
    );
  }

  if (etapa === "analisando") {
    return (
      <div className="glass-panel rounded-2xl p-8">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
          <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">
            Analisando sua fatura
          </h2>
        </div>
        <ul className="mt-5 space-y-2.5">
          {PASSOS_ANALISE.map((passo, i) => (
            <li key={passo} className="flex items-center gap-2.5 text-sm">
              {i < passoAnalise ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />
              ) : i === passoAnalise ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent)]" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-[var(--color-border-strong)]" />
              )}
              <span className={i <= passoAnalise ? "text-[var(--color-heading)]" : "text-[var(--color-muted)]"}>
                {passo}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /* --------------------------- Etapa: revisar --------------------------- */

  return (
    <div className="space-y-6">
      {/* Cabeçalho da análise */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[var(--color-heading)]">
            Raio-X da fatura{faturaReferencia ? ` · ${faturaReferencia}` : ""}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            {fonteIA === "ia" ? (
              <>
                <Sparkles className="h-3.5 w-3.5" /> Categorizado com IA
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" /> Categorizado pelo catálogo local
              </>
            )}
            {` · ${transacoes.length} ${transacoes.length === 1 ? "compra" : "compras"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={reiniciar} className="rounded-xl px-3.5 py-2 text-xs font-semibold glass-panel cursor-pointer">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!ctx}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-4 w-4" />
            Salvar no DuoFinance
          </button>
        </div>
      </div>

      {erroSalvar && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {erroSalvar}
        </p>
      )}

      {aviso && (
        <p role="status" className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-xs text-[var(--color-muted)]">
          {aviso}
        </p>
      )}

      {/* 4 cards de topo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardTopo
          icone={<Wallet className="h-4 w-4" />}
          titulo="Total da fatura"
          valor={brl(raioX.totalFatura)}
          legenda="Soma líquida de gastos"
        />
        <CardTopo
          icone={<Coins className="h-4 w-4" />}
          titulo="Compras do mês (à vista)"
          valor={brl(raioX.totalAVista)}
          legenda={`${raioX.qtdAVista} ${raioX.qtdAVista === 1 ? "compra" : "compras"} · ${raioX.percentualAVista}% da fatura`}
        />
        <CardTopo
          icone={<Layers className="h-4 w-4" />}
          titulo="Compras parceladas"
          valor={brl(raioX.totalParceladoMes)}
          legenda={`${raioX.qtdParcelada} ${raioX.qtdParcelada === 1 ? "item parcelado" : "itens parcelados"} neste mês`}
        />
        <CardTopo
          icone={<TrendingUp className="h-4 w-4" />}
          titulo="Comprometimento futuro"
          valor={brl(raioX.comprometimentoFuturo)}
          legenda="Parcelas que ainda vão vencer"
        />
      </div>

      {/* Com o que você gastou */}
      {raioX.porCategoria.length > 0 && (
        <div className="glass-panel rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-[var(--color-heading)]">Com o que você gastou</h3>
            {filtroCategoria && (
              <button
                type="button"
                onClick={() => setFiltroCategoria(null)}
                className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-[var(--color-muted)] dark:bg-white/10 cursor-pointer"
              >
                <Filter className="h-3.5 w-3.5" />
                Limpar filtro
              </button>
            )}
          </div>
          <div className="space-y-3">
            {raioX.porCategoria.map((c) => {
              const ativo = filtroCategoria === c.category;
              return (
                <button
                  key={c.category}
                  type="button"
                  onClick={() => setFiltroCategoria(ativo ? null : c.category)}
                  className={`block w-full text-left transition-opacity ${filtroCategoria && !ativo ? "opacity-50" : ""}`}
                  title={`Filtrar por ${c.category}`}
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-heading)]">
                      <CategoryIcon name={c.icon} className="h-4 w-4" />
                      {c.category}
                      <span className="font-normal text-[var(--color-muted)]">
                        · {c.quantidade} {c.quantidade === 1 ? "compra" : "compras"}
                      </span>
                    </span>
                    <span className="font-semibold text-[var(--color-heading)]">
                      {brl(c.total)} <span className="text-[var(--color-muted)]">({c.percentual}%)</span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(c.percentual, 2)}%`,
                        backgroundColor: COR_CATEGORIA[c.category],
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Abas de revisão */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <AbaBotao ativo={aba === "todos"} onClick={() => setAba("todos")} rotulo={`Todos (${transacoes.length})`} />
          <AbaBotao
            ativo={aba === "avista"}
            onClick={() => setAba("avista")}
            rotulo={`À vista (${transacoes.filter((t) => !t.installmentInfo.isInstallment).length})`}
          />
          <AbaBotao
            ativo={aba === "parcelados"}
            icone={<Layers className="h-4 w-4" />}
            onClick={() => setAba("parcelados")}
            rotulo={`Parcelados (${raioX.qtdParcelada})`}
          />
        </div>

        {selecionados.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-xs">
            <span className="font-semibold text-[var(--color-heading)]">{selecionados.size} selecionado(s)</span>
            <button
              type="button"
              onClick={() => marcarSelecionadosComo("compartilhado")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-3 py-1 font-semibold text-[var(--color-accent-foreground)] cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              Marcar como Compartilhado
            </button>
            <button
              type="button"
              onClick={() => marcarSelecionadosComo("pessoal_privado")}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1 font-semibold text-[var(--color-muted)] dark:bg-white/10 cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" />
              Marcar como Privado
            </button>
          </div>
        )}

        {listaFiltrada.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Nenhuma compra nesta aba.</p>
        ) : (
          <div className="space-y-2.5">
            {listaFiltrada.map((t) => (
              <LinhaTransacao
                key={t.id}
                t={t}
                selecionado={selecionados.has(t.id)}
                onSelecionar={() => alternarSelecionado(t.id)}
                onCategoria={(c) => trocarCategoria(t.id, c)}
                onEscopo={(e) => trocarEscopo(t.id, e)}
              />
            ))}
          </div>
        )}

        {ignoradas.length > 0 && (
          <details className="mt-5 rounded-xl border border-[var(--color-border)] px-4 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--color-muted)]">
              {ignoradas.length === 1 ? "1 linha não importada" : `${ignoradas.length} linhas não importadas`}{" "}
              (pagamentos, estornos e saldos)
            </summary>
            <ul className="mt-3 space-y-1.5">
              {ignoradas.map((l) => (
                <li key={l.linha} className="text-xs text-[var(--color-muted)]">
                  <span className="font-semibold text-[var(--color-heading)]">Linha {l.linha}:</span> {l.motivo} —{" "}
                  <span className="break-all font-mono">{l.texto}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Subcomponentes ---------------------------- */

function CardTopo({
  icone,
  titulo,
  valor,
  legenda,
}: {
  icone: React.ReactNode;
  titulo: string;
  valor: string;
  legenda: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {icone}
        {titulo}
      </span>
      <p className="mt-2 font-serif text-2xl font-bold text-[var(--color-heading)]">{valor}</p>
      <span className="mt-1 block text-xs text-[var(--color-muted)]">{legenda}</span>
    </div>
  );
}

function AbaBotao({
  ativo,
  onClick,
  rotulo,
  icone,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  icone?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer transition-all ${
        ativo ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "glass-panel text-[var(--color-muted)]"
      }`}
    >
      {icone}
      {rotulo}
    </button>
  );
}

const brlLinha = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

function LinhaTransacao({
  t,
  selecionado,
  onSelecionar,
  onCategoria,
  onEscopo,
}: {
  t: TransacaoAnalisada;
  selecionado: boolean;
  onSelecionar: () => void;
  onCategoria: (c: CategoriaDuoFinance) => void;
  onEscopo: (e: EscopoSugerido) => void;
}) {
  const compartilhado = t.suggestedScope === "compartilhado";
  const parcela = t.installmentInfo;
  const progresso = parcela.isInstallment
    ? Math.round((parcela.currentInstallment / parcela.totalInstallments) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-[var(--color-border)] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selecionado}
            onChange={onSelecionar}
            aria-label={`Selecionar ${t.cleanMerchantName}`}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
          />
          <span className="mt-0.5 shrink-0 text-[var(--color-heading)]">
            <CategoryIcon name={t.categoryIcon} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-[var(--color-heading)]">
              {t.cleanMerchantName} <span className="font-normal text-[var(--color-muted)]">— {t.whatWasBought}</span>
            </p>
            <p className="break-all text-xs text-[var(--color-muted)]">
              {t.dataBR} · {t.descricaoOriginal}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="font-serif text-sm font-bold text-[var(--color-heading)]">{brlLinha(t.valor)}</span>

          {/* Troca de categoria em 1 clique */}
          <div className="relative">
            <select
              value={t.category}
              onChange={(e) => onCategoria(e.target.value as CategoriaDuoFinance)}
              aria-label="Trocar categoria"
              className="glass-input appearance-none py-1.5 pl-3 pr-7 text-xs"
            >
              {CATEGORIAS_DUOFINANCE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
          </div>

          {/* Toggle de privacidade */}
          <button
            type="button"
            onClick={() => onEscopo(compartilhado ? "pessoal_privado" : "compartilhado")}
            title="Alternar entre compartilhar com o casal e manter privado"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              compartilhado
                ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                : "bg-black/5 text-[var(--color-muted)] dark:bg-white/10"
            }`}
          >
            {compartilhado ? <Users className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {compartilhado ? "Compartilhar" : "Privado"}
          </button>
        </div>
      </div>

      {/* Card de progresso da parcela */}
      {parcela.isInstallment && (
        <div className="mt-3 rounded-lg bg-black/[0.03] px-3 py-2.5 dark:bg-white/[0.04]">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 font-semibold text-[var(--color-accent-foreground)]">
              <Layers className="h-3 w-3" />
              Parcela {String(parcela.currentInstallment).padStart(2, "0")}/
              {String(parcela.totalInstallments).padStart(2, "0")}
            </span>
            <span className="text-[var(--color-muted)]">
              Valor desta parcela:{" "}
              <strong className="text-[var(--color-heading)]">{brlLinha(parcela.installmentAmount)}</strong>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--color-accent)]"
              style={{ width: `${Math.max(progresso, 3)}%` }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
            <span>
              Total da compra:{" "}
              <strong className="text-[var(--color-heading)]">{brlLinha(parcela.totalPurchaseAmount)}</strong>
            </span>
            {parcela.remainingMonths > 0 && (
              <span>
                Faltam {parcela.remainingMonths}x ({brlLinha(parcela.remainingAmount)})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
