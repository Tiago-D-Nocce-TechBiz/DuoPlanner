"use client";

import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Coins,
  Filter,
  Layers,
  Loader2,
  Lock,
  PenLine,
  ScanLine,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  Wallet,
} from "@/components/ui/icons";
import { CategoryIcon, COR_CATEGORIA } from "@/components/finance/category-icon";
import { enriquecerTransacoes } from "@/app/dashboard/financas/analyze-invoice";
import { falha } from "@/lib/acoes/resultado";
import { todayInSaoPaulo } from "@/lib/dates";
import { reconciliarImportacao, type LinhaImportada, type MotivoDuplicado } from "@/lib/finance/duplicados";
import {
  emLotes,
  executarEmLotes,
  linhasParaIa,
  LOTES_SIMULTANEOS_IA,
  type TransacaoParaEnriquecer,
} from "@/lib/finance/enriquecimento";
import { fingerprintsDoLote, proximoFingerprintLivre, type CompraParaFingerprint } from "@/lib/finance/fingerprint";
import {
  analisarFatura,
  calcularRaioX,
  categoriaParaStore,
  compraDaTransacao,
  escopoParaStore,
  CATEGORIAS_DUOFINANCE,
  type CategoriaDuoFinance,
  type EscopoSugerido,
  type TransacaoAnalisada,
} from "@/lib/finance/invoice-analyzer";
import type { LinhaIgnorada } from "@/lib/finance/importar";
import { formatBRL, toCents } from "@/lib/finance/money";
import { reduzirRevisao, REVISAO_VAZIA } from "@/lib/finance/revisao-fatura";
import { criarDespesa, useDespesas } from "@/lib/finance/store";
import { useContextoSync } from "@/lib/sync/motor";

/**
 * Importador de faturas do DuoFinance, em duas fases:
 *
 *  1. No navegador, na hora (< 100 ms numa fatura comum): leitura do CSV/TXT,
 *     à vista × parcelado, Raio-X (total, comprometimento futuro, categorias),
 *     catálogo local de estabelecimentos e a checagem do que já está no
 *     DuoFinance (`transaction_fingerprint`, depois data + valor). A tabela
 *     aparece pronta para revisar e salvar.
 *  2. Em segundo plano: só as compras que o catálogo não reconheceu com
 *     certeza vão para a IA, em lotes. Cada linha mostra um esqueleto até a
 *     resposta chegar e se atualiza sozinha. Nada bloqueia: dá para editar e
 *     salvar a qualquer momento, e a categoria escolhida à mão não é desfeita.
 */

/* --------------------------------- Utils --------------------------------- */

const brl = (v: number) => formatBRL(toCents(v));
const TAMANHO_MAXIMO_ARQUIVO = 2 * 1024 * 1024;
/** User Timing da fase 1 (texto pronto → tabela na tela); os testes de navegador leem. */
const MARCA_FASE1 = "duofinance:fase1";
/**
 * Linhas da primeira pintura. A lista começa abaixo do Raio-X: no celular
 * nenhuma linha aparece sem rolar; num notebook (1280 × 800 a 1440 × 900)
 * aparecem 2 a 3 e num monitor 1920 × 1080, 6 (medido com o CSS real). Cada
 * linha custa de 3 a 6 ms na fase 1 de um celular médio (CPU 4x): montar 20
 * de cara deixava a fase 1 ~70 ms mais lenta sem mostrar nada a mais. As
 * demais entram em levas, uma por quadro.
 */
const LINHAS_IMEDIATAS = 4;
/** Linhas montadas por quadro depois disso (cada leva custa poucos ms de estilo e layout). */
const LINHAS_POR_QUADRO = 20;
/** Altura reservada por linha ainda não montada: estimativa da linha + espaçamento. */
const ALTURA_LINHA_RESERVADA = 106;
const SEM_DUPLICADOS: ReadonlyMap<string, MotivoDuplicado> = new Map();

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

const temArquivos = (dados: DataTransfer | null) => Boolean(dados && Array.from(dados.types).includes("Files"));

/** Fingerprints do lote; null se algo inesperado falhar (aí vale só a checagem por data e valor). */
function fingerprintsOuNada(compras: CompraParaFingerprint[]): string[] | null {
  try {
    return fingerprintsDoLote(compras);
  } catch {
    return null;
  }
}

/** "Importar mesmo assim": a próxima ocorrência livre; null se esgotar (a linha sai sem fingerprint). */
function proximoLivreOuNada(compra: CompraParaFingerprint, ocupados: ReadonlySet<string>): string | null {
  try {
    return proximoFingerprintLivre(compra, ocupados);
  } catch {
    return null;
  }
}

function marcar(nome: string) {
  try {
    performance.mark(nome);
  } catch {
    // User Timing indisponível: só perde a medição.
  }
}

type Aba = "todos" | "avista" | "parcelados";
/** Escolha explícita da pessoa; sem ela, vale o padrão (duplicada = pular). */
type Decisao = "salvar" | "pular";
type EstadoIa =
  | { fase: "ociosa" }
  | { fase: "trabalhando" }
  | { fase: "concluida"; fonte: "ia" | "dicionario"; aviso: string | null };

/* ------------------------------ Componente ------------------------------- */

export function SmartInvoiceImporter() {
  const ctx = useContextoSync();
  const despesas = useDespesas();
  const meuId = ctx?.userId ?? null;

  const [revisao, despachar] = useReducer(reduzirRevisao, REVISAO_VAZIA);
  const { transacoes, aguardandoIa } = revisao;
  /** Importação atual: respostas de importações anteriores são descartadas. */
  const geracaoRef = useRef(0);

  const [emRevisao, setEmRevisao] = useState(false);
  const [linhas, setLinhas] = useState<LinhaImportada[]>([]);
  /** id da linha → transaction_fingerprint; null = navegador sem Web Crypto. */
  const [fingerprints, setFingerprints] = useState<ReadonlyMap<string, string> | null>(null);
  const [decisoes, setDecisoes] = useState<ReadonlyMap<string, Decisao>>(() => new Map());
  const [ignoradas, setIgnoradas] = useState<LinhaIgnorada[]>([]);
  const [faturaReferencia, setFaturaReferencia] = useState("");
  const [textoColado, setTextoColado] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [ia, setIa] = useState<EstadoIa>({ fase: "ociosa" });
  const [arrastando, setArrastando] = useState(false);

  const [aba, setAba] = useState<Aba>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaDuoFinance | null>(null);
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(() => new Set());
  /** Quantos gastos entraram na fila, em qual espaço (null = sem casal ainda) e quantos já existiam. */
  const [salvo, setSalvo] = useState<{ quantidade: number; espaco: string | null; pulados: number } | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const raioX = useMemo(() => calcularRaioX(transacoes), [transacoes]);

  // O que já está no DuoFinance, recalculado se os gastos chegarem depois
  // (painel ainda carregando, par lançou algo enquanto a fatura é revisada).
  const duplicados = useMemo(
    () => (meuId && linhas.length > 0 ? reconciliarImportacao(linhas, despesas, meuId) : SEM_DUPLICADOS),
    [linhas, despesas, meuId]
  );
  const estaPulada = useCallback(
    (id: string) => {
      const decisao = decisoes.get(id);
      return decisao ? decisao === "pular" : duplicados.has(id);
    },
    [decisoes, duplicados]
  );

  // Fase 1 medida até a tabela estar no DOM (antes da pintura).
  useLayoutEffect(() => {
    if (!emRevisao || revisao.geracao === 0) return;
    try {
      performance.measure(MARCA_FASE1, `${MARCA_FASE1}:${revisao.geracao}`);
    } catch {
      // marca ausente (outra importação começou): sem medição
    }
  }, [emRevisao, revisao.geracao]);

  // Arquivo solto fora da área de envio não pode abrir no navegador (a
  // pessoa perderia a revisão em andamento).
  useEffect(() => {
    const foraDaZona = (e: DragEvent) =>
      temArquivos(e.dataTransfer) && !(e.target instanceof Element && e.target.closest("[data-zona-arquivo]"));
    const aoArrastar = (e: DragEvent) => {
      if (!foraDaZona(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    const aoSoltar = (e: DragEvent) => {
      if (foraDaZona(e)) e.preventDefault();
    };
    window.addEventListener("dragover", aoArrastar);
    window.addEventListener("drop", aoSoltar);
    return () => {
      window.removeEventListener("dragover", aoArrastar);
      window.removeEventListener("drop", aoSoltar);
    };
  }, []);

  /* ---- Fase 1: análise local ---- */

  function processar(texto: string) {
    const geracao = ++geracaoRef.current;
    marcar(`${MARCA_FASE1}:${geracao}`);
    const base = analisarFatura(texto, todayInSaoPaulo());
    if (base.transacoes.length === 0) {
      setAviso(
        base.ignoradas.length > 0
          ? "Nenhuma compra reconhecida — só pagamentos, estornos ou linhas de saldo."
          : "Nenhum lançamento encontrado. Envie o CSV da fatura ou cole uma linha por gasto."
      );
      return;
    }
    const compras = base.transacoes.map(compraDaTransacao);
    // SHA-256 síncrono (`@/lib/finance/sha256`): a fase 1 inteira roda num
    // passo só, sem esperar uma promessa por compra no laço de eventos.
    const fps = fingerprintsOuNada(compras);

    const novasLinhas: LinhaImportada[] = base.transacoes.map((t, i) => ({
      id: t.id,
      dataIso: t.dataIso,
      valor: t.valor,
      moeda: t.moeda,
      fingerprint: fps?.[i] ?? null,
      parcela: compras[i].parcela,
    }));
    // Já importadas ou já lançadas começam fora do salvamento e não vão para
    // a IA (não gastam cota). Com a IA desligada no servidor, nem tenta.
    const jaExistentes = meuId ? reconciliarImportacao(novasLinhas, despesas, meuId) : SEM_DUPLICADOS;
    const paraIa = ctx?.iaAtiva === false ? [] : linhasParaIa(base.transacoes, new Set(jaExistentes.keys()));

    despachar({ tipo: "carregar", geracao, transacoes: base.transacoes, aguardandoIa: paraIa.map((l) => l.id) });
    setLinhas(novasLinhas);
    setFingerprints(fps ? new Map(base.transacoes.map((t, i) => [t.id, fps[i]])) : null);
    setDecisoes(new Map());
    setSelecionados(new Set());
    setIgnoradas(base.ignoradas);
    setFaturaReferencia(base.faturaReferencia);
    setAviso(null);
    setErroSalvar(null);
    setIa(paraIa.length > 0 ? { fase: "trabalhando" } : { fase: "concluida", fonte: "dicionario", aviso: null });
    setEmRevisao(true);
    if (paraIa.length > 0) void refinarComIa(geracao, paraIa);
  }

  /* ---- Fase 2: IA em segundo plano, lote a lote ---- */

  async function refinarComIa(geracao: number, paraIa: TransacaoParaEnriquecer[]) {
    const atual = () => geracaoRef.current === geracao;
    let interrupcao: string | null = null;
    let respondeu = false;
    await executarEmLotes(
      emLotes(paraIa),
      LOTES_SIMULTANEOS_IA,
      async (lote) => {
        const ids = lote.map((l) => l.id);
        const r = await enriquecerTransacoes(lote).catch(() =>
          falha("INDISPONIVEL", "Sem conexão com o servidor: mantivemos a categorização local.")
        );
        if (!atual()) return;
        if (r.success) {
          respondeu = true;
          despachar({ tipo: "enriquecer", geracao, itens: r.data, lote: ids });
          return;
        }
        // Qualquer falha encerra a etapa: sem chave, sem cota, sem sessão ou
        // IA fora do ar (cada novo lote gastaria cota à toa).
        if (interrupcao === null) interrupcao = r.error;
        despachar({ tipo: "liberar", geracao, ids });
      },
      () => !atual() || interrupcao !== null
    );
    if (!atual()) return;
    despachar({ tipo: "liberar", geracao });
    setIa({ fase: "concluida", fonte: respondeu ? "ia" : "dicionario", aviso: interrupcao });
  }

  /* ---- Entrada: arquivo, arrastar e soltar, texto colado ---- */

  async function lerArquivo(file: File | undefined) {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name) && !file.type.startsWith("text/")) {
      setAviso("Formato não suportado. Envie o arquivo CSV ou TXT da fatura.");
      return;
    }
    if (file.size > TAMANHO_MAXIMO_ARQUIVO) {
      setAviso("Arquivo grande demais (máximo de 2 MB). Exporte um mês por vez.");
      return;
    }
    try {
      processar(await lerArquivoComoTexto(file));
    } catch {
      setAviso("Não foi possível ler o arquivo. Tente de novo ou cole o texto da fatura.");
    }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    void lerArquivo(file);
  }

  function reiniciar() {
    const geracao = ++geracaoRef.current;
    despachar({ tipo: "limpar", geracao });
    setEmRevisao(false);
    setLinhas([]);
    setFingerprints(null);
    setDecisoes(new Map());
    setIgnoradas([]);
    setFaturaReferencia("");
    setTextoColado("");
    setAviso(null);
    setIa({ fase: "ociosa" });
    setAba("todos");
    setFiltroCategoria(null);
    setSelecionados(new Set());
    setSalvo(null);
    setErroSalvar(null);
  }

  /* ---- Edição em linha (callbacks estáveis: as linhas são memoizadas) ---- */

  const trocarCategoria = useCallback(
    (id: string, category: CategoriaDuoFinance) => despachar({ tipo: "categoria", id, category }),
    []
  );
  const trocarEscopo = useCallback(
    (id: string, escopo: EscopoSugerido) => despachar({ tipo: "escopo", ids: [id], escopo }),
    []
  );
  const alternarSelecionado = useCallback((id: string) => {
    setSelecionados((prev) => {
      const prox = new Set(prev);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });
  }, []);
  const decidir = useCallback((id: string, decisao: Decisao) => {
    setDecisoes((prev) => new Map(prev).set(id, decisao));
  }, []);

  function marcarSelecionadosComo(escopo: EscopoSugerido) {
    if (selecionados.size === 0) return;
    despachar({ tipo: "escopo", ids: [...selecionados], escopo });
    setSelecionados(new Set());
  }

  /* ---- Confirmação: grava em despesas_viagem pela fila de sincronização ---- */

  // Mesmo caminho dos demais gastos: fila persistida (sobrevive a ficar
  // offline), RLS por espaço e escopo, Realtime para o par e entrada no
  // acerto. O servidor valida cada linha e tira user_id/workspace_id da sessão.
  // Síncrono: grava na fila e troca para a tela de sucesso no mesmo clique
  // (não há "Salvando…" a mostrar, nem segundo clique possível).
  function confirmar() {
    const validas = transacoes.filter((t) => !t.ignorarNoCalculo);
    const aSalvar = validas.filter((t) => !estaPulada(t.id));
    if (aSalvar.length === 0) return;
    if (!ctx) {
      setErroSalvar("O painel ainda está carregando. Tente de novo em instantes.");
      return;
    }
    // Respostas da IA que chegarem depois daqui não mexem em nada.
    geracaoRef.current++;
    // Fingerprints já usados por esta pessoa (salvos ou na fila). Linhas
    // novas ficam com a ocorrência natural (a próxima reimportação as
    // reconhece igual); só a linha salva "mesmo assim" recebe a próxima
    // ocorrência livre, que o índice único do banco aceita.
    const ocupados = new Set<string>();
    for (const d of despesas) {
      if (d.userId === ctx.userId && d.transactionFingerprint) ocupados.add(d.transactionFingerprint);
    }
    const finais = new Map<string, string | null>();
    const repetidas: TransacaoAnalisada[] = [];
    for (const t of aSalvar) {
      const fp = fingerprints?.get(t.id) ?? null;
      if (fp && ocupados.has(fp)) {
        repetidas.push(t);
        continue;
      }
      if (fp) ocupados.add(fp);
      finais.set(t.id, fp);
    }
    for (const t of repetidas) {
      const fp = proximoLivreOuNada(compraDaTransacao(t), ocupados);
      if (fp) ocupados.add(fp);
      finais.set(t.id, fp);
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
          parcela: parcela.isInstallment ? { atual: parcela.currentInstallment, total: parcela.totalInstallments } : null,
          referencia: faturaReferencia,
          fingerprint: finais.get(t.id) ?? null,
        },
      });
      if (criado) quantidade++;
    }
    setErroSalvar(null);
    setSalvo({ quantidade, espaco: ctx.workspace?.nome ?? null, pulados: validas.length - aSalvar.length });
  }

  /* ---- Render ---- */

  const listaFiltrada = useMemo(() => {
    let l = transacoes;
    if (aba === "avista") l = l.filter((t) => !t.installmentInfo.isInstallment);
    if (aba === "parcelados") l = l.filter((t) => t.installmentInfo.isInstallment);
    if (filtroCategoria) l = l.filter((t) => t.category === filtroCategoria);
    return l;
  }, [transacoes, aba, filtroCategoria]);

  // Nova importação, aba ou filtro recomeçam a montagem progressiva; as
  // respostas da IA não mudam a chave (as linhas já montadas ficam).
  const limiteLinhas = useLinhasProgressivas(
    listaFiltrada.length,
    `${revisao.geracao}:${aba}:${filtroCategoria ?? ""}`
  );
  const linhasNaTela = limiteLinhas < listaFiltrada.length ? listaFiltrada.slice(0, limiteLinhas) : listaFiltrada;

  const resumoDuplicados = useMemo(() => {
    let jaImportadas = 0;
    let parecemLancadas = 0;
    for (const motivo of duplicados.values()) {
      if (motivo.tipo === "ja_importado") jaImportadas++;
      else parecemLancadas++;
    }
    return { jaImportadas, parecemLancadas };
  }, [duplicados]);

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
        {salvo.pulados > 0 && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {salvo.pulados === 1
              ? "1 compra já estava no DuoFinance e não foi salva de novo."
              : `${salvo.pulados} compras já estavam no DuoFinance e não foram salvas de novo.`}
          </p>
        )}
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

  if (!emRevisao) {
    return (
      <div className="glass-panel rounded-2xl p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="font-serif text-2xl font-bold text-[var(--color-heading)]">Importar fatura do cartão</h2>
          <p className="mt-1.5 text-sm text-[var(--color-muted)] max-w-2xl">
            Envie o CSV da fatura (Nubank, Inter, Itaú, C6, XP, Santander), um TXT ou cole o texto. O DuoFinance separa
            compras à vista e parceladas, limpa o nome das lojas e categoriza tudo para você revisar antes de salvar.
          </p>
        </div>

        <label
          data-zona-arquivo
          onDragEnter={(e) => {
            if (!temArquivos(e.dataTransfer)) return;
            e.preventDefault();
            setArrastando(true);
          }}
          onDragOver={(e) => {
            if (!temArquivos(e.dataTransfer)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            void lerArquivo(e.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-accent)] ${
            arrastando
              ? "border-[var(--color-accent)] bg-black/[0.04] dark:bg-white/[0.06]"
              : "border-[var(--color-border-strong)] hover:border-[var(--color-accent)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
          }`}
        >
          <Upload className="h-8 w-8 text-[var(--color-accent)]" />
          <span className="text-sm font-semibold text-[var(--color-heading)]">
            {arrastando ? "Solte o arquivo para analisar" : "Arraste o arquivo aqui ou clique para selecionar"}
          </span>
          <span className="text-xs text-[var(--color-muted)]">CSV ou TXT, até 2 MB (um mês por arquivo)</span>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleUpload} className="sr-only" />
        </label>

        <div className="mt-5">
          <label
            htmlFor="fatura-texto"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]"
          >
            Ou cole o texto da fatura
          </label>
          <textarea
            id="fatura-texto"
            value={textoColado}
            onChange={(e) => setTextoColado(e.target.value)}
            rows={4}
            maxLength={TAMANHO_MAXIMO_ARQUIVO}
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

  /* --------------------------- Etapa: revisar --------------------------- */

  const qtdASalvar = transacoes.filter((t) => !t.ignorarNoCalculo && !estaPulada(t.id)).length;
  const avisoIa = ia.fase === "concluida" ? ia.aviso : null;

  return (
    <div className="space-y-6" data-revisao-fatura>
      {/* Cabeçalho da análise */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[var(--color-heading)]">
            Raio-X da fatura{faturaReferencia ? ` · ${faturaReferencia}` : ""}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]" aria-live="polite">
            {aguardandoIa.size > 0 ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                Refinando {aguardandoIa.size} {aguardandoIa.size === 1 ? "compra" : "compras"} com IA · você já pode
                revisar e salvar
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {ia.fase === "concluida" && ia.fonte === "ia"
                  ? "Categorizado pelo catálogo local e pela IA"
                  : "Categorizado pelo catálogo local"}
              </>
            )}
            <span>· {transacoes.length} {transacoes.length === 1 ? "compra" : "compras"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={reiniciar} className="rounded-xl px-3.5 py-2 text-xs font-semibold glass-panel cursor-pointer">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => confirmar()}
            disabled={!ctx || qtdASalvar === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-4 w-4" />
            {qtdASalvar === 0 ? "Nada novo para salvar" : `Salvar ${qtdASalvar} no DuoFinance`}
          </button>
        </div>
      </div>

      {erroSalvar && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {erroSalvar}
        </p>
      )}

      {(aviso || avisoIa) && (
        <p role="status" className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-xs text-[var(--color-muted)]">
          {[aviso, avisoIa].filter(Boolean).join(" ")}
        </p>
      )}

      {duplicados.size > 0 && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-[var(--color-border-strong)] px-4 py-2.5 text-xs text-[var(--color-heading)]"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{textoResumoDuplicados(resumoDuplicados.jaImportadas, resumoDuplicados.parecemLancadas)}</span>
        </p>
      )}

      {/* 4 cards de topo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardTopo icone={<Wallet className="h-4 w-4" />} titulo="Total da fatura" valor={brl(raioX.totalFatura)} legenda="Soma líquida de gastos" />
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
                      style={{ width: `${Math.max(c.percentual, 2)}%`, backgroundColor: COR_CATEGORIA[c.category] }}
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
            rotulo={`Parcelados (${transacoes.filter((t) => t.installmentInfo.isInstallment).length})`}
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
            {linhasNaTela.map((t) => {
              const motivo = duplicados.get(t.id);
              return (
                <LinhaTransacao
                  key={t.id}
                  t={t}
                  selecionado={selecionados.has(t.id)}
                  aguardandoIa={aguardandoIa.has(t.id)}
                  duplicadoTipo={motivo?.tipo ?? null}
                  duplicadoComo={motivo?.descricao ?? null}
                  pulado={estaPulada(t.id)}
                  onSelecionar={alternarSelecionado}
                  onCategoria={trocarCategoria}
                  onEscopo={trocarEscopo}
                  onDecidir={decidir}
                />
              );
            })}
            {/* Espaço das linhas que chegam em seguida: a barra de rolagem não pula. */}
            {linhasNaTela.length < listaFiltrada.length && (
              <div aria-hidden style={{ height: (listaFiltrada.length - linhasNaTela.length) * ALTURA_LINHA_RESERVADA }} />
            )}
          </div>
        )}

        {ignoradas.length > 0 && (
          <details className="mt-5 rounded-xl border border-[var(--color-border)] px-4 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--color-muted)]">
              {ignoradas.length === 1 ? "1 linha não importada" : `${ignoradas.length} linhas não importadas`} (pagamentos,
              estornos e saldos)
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

/**
 * Quantas linhas da lista montar agora: `LINHAS_IMEDIATAS` a cada nova lista
 * (`chave`) e mais uma leva por quadro até `total`.
 *
 * Fatura longa: montar centenas de linhas de uma vez levaria a fase 1 bem
 * além de 100 ms e, mesmo fora dela, o estilo e o layout de milhares de
 * elementos travariam a tela por centenas de ms. Em levas, cada quadro fica
 * curto, e a transição deixa cliques e digitação passarem na frente. O
 * Raio-X não depende disto: ele já soma todas as compras.
 */
function useLinhasProgressivas(total: number, chave: string): number {
  const [leva, setLeva] = useState({ chave, limite: LINHAS_IMEDIATAS });
  const limite = leva.chave === chave ? leva.limite : LINHAS_IMEDIATAS;
  useEffect(() => {
    if (limite >= total) return;
    const quadro = requestAnimationFrame(() =>
      startTransition(() => setLeva({ chave, limite: limite + LINHAS_POR_QUADRO }))
    );
    return () => cancelAnimationFrame(quadro);
  }, [chave, limite, total]);
  return limite;
}

function textoResumoDuplicados(jaImportadas: number, parecemLancadas: number): string {
  const partes: string[] = [];
  if (jaImportadas > 0) {
    partes.push(
      jaImportadas === 1 ? "1 compra desta fatura já foi importada antes" : `${jaImportadas} compras desta fatura já foram importadas antes`
    );
  }
  if (parecemLancadas > 0) {
    partes.push(
      parecemLancadas === 1
        ? "1 parece já lançada no DuoFinance (mesma data e valor)"
        : `${parecemLancadas} parecem já lançadas no DuoFinance (mesma data e valor)`
    );
  }
  const total = jaImportadas + parecemLancadas;
  return `${partes.join(" e ")}. ${total === 1 ? "Ela não será salva" : "Elas não serão salvas"} de novo, a menos que você toque em “Importar mesmo assim”.`;
}

/* ----------------------------- Subcomponentes ---------------------------- */

function CardTopo({ icone, titulo, valor, legenda }: { icone: React.ReactNode; titulo: string; valor: string; legenda: string }) {
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
      aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer transition-all ${
        ativo ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "glass-panel text-[var(--color-muted)]"
      }`}
    >
      {icone}
      {rotulo}
    </button>
  );
}

function textoDuplicado(tipo: MotivoDuplicado["tipo"], como: string, pulado: boolean): string {
  if (tipo === "ja_importado") {
    return pulado ? "Já importado anteriormente (Ignorado)." : `Será importado de novo (já existe “${como}” desta mesma fatura).`;
  }
  return pulado
    ? `Parece já lançado como “${como}” (mesma data e valor): não será salvo.`
    : `Será salvo mesmo assim (já existe “${como}” com a mesma data e valor).`;
}

interface PropsLinha {
  t: TransacaoAnalisada;
  selecionado: boolean;
  /** A IA ainda está analisando esta compra (etapa 2): mostra o esqueleto. */
  aguardandoIa: boolean;
  /** Já está no DuoFinance: por fingerprint ("ja_importado") ou por data e valor. */
  duplicadoTipo: MotivoDuplicado["tipo"] | null;
  /** Descrição do gasto que já existe. */
  duplicadoComo: string | null;
  pulado: boolean;
  onSelecionar: (id: string) => void;
  onCategoria: (id: string, c: CategoriaDuoFinance) => void;
  onEscopo: (id: string, e: EscopoSugerido) => void;
  onDecidir: (id: string, decisao: Decisao) => void;
}

/**
 * Memoizada: com centenas de linhas, só a que mudou (resposta da IA, edição)
 * renderiza de novo. `content-visibility` deixa o navegador pular o layout das
 * linhas fora da tela; a altura reservada para elas é a medida em
 * `importador-producao.spec.ts`: 118 px no celular, ~90 px no sm, 70 px a
 * partir do md (linha com aviso de duplicada ou parcela é mais alta).
 */
const LinhaTransacao = memo(function LinhaTransacao({
  t,
  selecionado,
  aguardandoIa,
  duplicadoTipo,
  duplicadoComo,
  pulado,
  onSelecionar,
  onCategoria,
  onEscopo,
  onDecidir,
}: PropsLinha) {
  const compartilhado = t.suggestedScope === "compartilhado";
  const parcela = t.installmentInfo;
  const progresso = parcela.isInstallment ? Math.round((parcela.currentInstallment / parcela.totalInstallments) * 100) : 0;

  return (
    <div
      data-linha-fatura={t.id}
      aria-busy={aguardandoIa || undefined}
      className={`rounded-xl border px-4 py-3 [content-visibility:auto] [contain-intrinsic-size:auto_118px] sm:[contain-intrinsic-size:auto_90px] md:[contain-intrinsic-size:auto_70px] ${
        pulado ? "border-dashed border-[var(--color-border-strong)] opacity-80" : "border-[var(--color-border)]"
      }`}
    >
      {duplicadoTipo && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-start gap-1.5 text-[var(--color-muted)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {textoDuplicado(duplicadoTipo, duplicadoComo ?? "", pulado)}
          </span>
          <button
            type="button"
            onClick={() => onDecidir(t.id, pulado ? "salvar" : "pular")}
            className="rounded-full px-3 py-1 font-semibold glass-panel cursor-pointer"
          >
            {pulado ? (duplicadoTipo === "ja_importado" ? "Importar mesmo assim" : "Salvar mesmo assim") : "Não salvar"}
          </button>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selecionado}
            onChange={() => onSelecionar(t.id)}
            aria-label={`Selecionar ${t.cleanMerchantName}`}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
          />
          <span className={`mt-0.5 shrink-0 text-[var(--color-heading)] ${aguardandoIa ? "opacity-60 motion-safe:animate-pulse" : ""}`}>
            <CategoryIcon name={t.categoryIcon} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-[var(--color-heading)]">
              {t.cleanMerchantName}{" "}
              {aguardandoIa ? (
                <>
                  <span
                    aria-hidden
                    className="inline-block h-3 w-28 translate-y-0.5 rounded bg-[var(--color-border)] motion-safe:animate-pulse"
                  />
                  <span className="sr-only">(a IA está analisando esta compra)</span>
                </>
              ) : (
                <span className="font-normal text-[var(--color-muted)]">— {t.whatWasBought}</span>
              )}
            </p>
            <p className="break-all text-xs text-[var(--color-muted)]">
              {t.dataBR} · {t.descricaoOriginal}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="font-serif text-sm font-bold text-[var(--color-heading)]">{brl(t.valor)}</span>

          {/* Troca de categoria em 1 clique (vale mesmo com a IA trabalhando) */}
          <div className="relative">
            <select
              value={t.category}
              onChange={(e) => onCategoria(t.id, e.target.value as CategoriaDuoFinance)}
              aria-label={`Categoria de ${t.cleanMerchantName}`}
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
            onClick={() => onEscopo(t.id, compartilhado ? "pessoal_privado" : "compartilhado")}
            title="Alternar entre compartilhar com o casal e manter privado"
            aria-pressed={compartilhado}
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
              Parcela {String(parcela.currentInstallment).padStart(2, "0")}/{String(parcela.totalInstallments).padStart(2, "0")}
            </span>
            <span className="text-[var(--color-muted)]">
              Valor desta parcela: <strong className="text-[var(--color-heading)]">{brl(parcela.installmentAmount)}</strong>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${Math.max(progresso, 3)}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
            <span>
              Total da compra: <strong className="text-[var(--color-heading)]">{brl(parcela.totalPurchaseAmount)}</strong>
            </span>
            {parcela.remainingMonths > 0 && (
              <span>
                Faltam {parcela.remainingMonths}x ({brl(parcela.remainingAmount)})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
