import "server-only";
import type { AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { describePreference, type DuoPreferences } from "@/lib/memory/preferences";
import { criarExtratorDeExperiencias, gemsOutputSchema } from "./experiencias-em-fluxo";
import { QUANTIDADE_EXPERIENCIAS, type EventoExperiencias, type LocalGem } from "./experiencias-protocolo";
import { AI_TIMEOUT_MS, AiNotConfiguredError, createGeminiModel } from "./model";

/**
 * Agente de Experiências Ocultas (Local Gems): depois de uma busca de voo ou
 * hospedagem, sugere 3 atividades gratuitas ou de baixo custo no destino.
 *
 * A resposta sai em fluxo (rota `POST /api/experiencias`, NDJSON): o Gemini
 * escreve o JSON (modo JSON com `responseJsonSchema`) e cada trecho vira um
 * rascunho do card em escrita; cada sugestão é validada assim que fica
 * completa. A primeira aparece na tela enquanto a IA ainda escreve as outras.
 *
 * Cache por instância do servidor (destino + mês + contexto, 1 dia): a
 * mesma dupla repetindo a busca não paga outra chamada à IA. O `"use cache"`
 * não serve aqui: ele não guarda um fluxo, e na Vercel o cache em memória
 * dele também é por instância.
 */

const SYSTEM_PROMPT = `Você é o curador de "Experiências Ocultas" do DuoPlanner, um app de viagens a dois.
Sugira exatamente 3 atividades GRATUITAS ou de BAIXO CUSTO no destino informado, fugindo do roteiro de cartão-postal.
Priorize lugares reais e consolidados, fáceis de verificar: mirantes, feiras, bairros, trilhas urbanas, museus com dia de entrada gratuita, eventos recorrentes.
Não cite lugares de cuja existência você não tenha certeza. Adapte as sugestões ao mês da viagem e ao contexto da dupla.
Escreva em português do Brasil, com tom de amigo local.`;

export interface PedidoExperiencias {
  destino: string;
  mes: string | null;
  /** Frases da memória da dupla que importam para passeios (`contextoDasPreferencias`). */
  contexto: string[];
}

/** Só o que importa para passeios entra no prompt (e na chave do cache). */
export function contextoDasPreferencias(prefs: DuoPreferences): string[] {
  const linhas: string[] = [];
  if (prefs.orcamento_diario_atividades !== undefined) {
    linhas.push(describePreference("orcamento_diario_atividades", prefs.orcamento_diario_atividades));
  }
  if (prefs.interesses?.length) linhas.push(describePreference("interesses", prefs.interesses));
  if (prefs.restricoes?.length) linhas.push(describePreference("restricoes", prefs.restricoes));
  return linhas;
}

/* ---------------------------------- cache ---------------------------------- */

const CACHE_VALIDADE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAXIMO = 100;
const cache = new Map<string, { expira: number; experiencias: LocalGem[] }>();

const chaveDoCache = (p: PedidoExperiencias) =>
  JSON.stringify([p.destino.normalize("NFC").toLocaleLowerCase("pt-BR"), p.mes, p.contexto]);

export function experienciasEmCache(pedido: PedidoExperiencias, agora = Date.now()): LocalGem[] | null {
  const chave = chaveDoCache(pedido);
  const item = cache.get(chave);
  if (!item) return null;
  if (item.expira <= agora) {
    cache.delete(chave);
    return null;
  }
  return item.experiencias;
}

function guardarNoCache(pedido: PedidoExperiencias, experiencias: LocalGem[], agora = Date.now()) {
  const chave = chaveDoCache(pedido);
  cache.delete(chave);
  // Map preserva a ordem de inserção: o primeiro é o mais antigo.
  while (cache.size >= CACHE_MAXIMO) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga === undefined) break;
    cache.delete(maisAntiga);
  }
  cache.set(chave, { expira: agora + CACHE_VALIDADE_MS, experiencias });
}

/** Só para testes: o cache é estado do módulo. */
export function limparCacheDeExperiencias() {
  cache.clear();
}

/* --------------------------------- prazos ---------------------------------- */

/**
 * Prazo por trecho: nenhum intervalo sem dados passa de 8 s (o primeiro
 * trecho inclui conectar e o raciocínio inicial). Um prazo único de 8 s para
 * a resposta inteira cortaria um fluxo saudável; este derruba só o que travou.
 */
export const PRAZO_POR_TRECHO_MS = AI_TIMEOUT_MS;
/** Teto da resposta inteira: limita o custo e o tempo da função. */
export const PRAZO_TOTAL_MS = 40_000;

export class PrazoDaIaEsgotado extends Error {
  constructor(readonly motivo: "trecho" | "total") {
    super(motivo === "trecho" ? "A IA parou de responder no meio do caminho." : "A IA passou do tempo máximo.");
    this.name = "TimeoutError";
  }
}

/** `promessa`, mas rejeita no prazo ou quando `sinal` aborta (o que vier antes). */
function aguardar<T>(promessa: Promise<T>, ms: number, motivo: PrazoDaIaEsgotado["motivo"], sinal: AbortSignal): Promise<T> {
  if (sinal.aborted) return Promise.reject(sinal.reason);
  return new Promise<T>((resolve, reject) => {
    const encerrar = () => {
      clearTimeout(relogio);
      sinal.removeEventListener("abort", aoAbortar);
    };
    const aoAbortar = () => {
      encerrar();
      reject(sinal.reason);
    };
    const relogio = setTimeout(() => {
      encerrar();
      reject(new PrazoDaIaEsgotado(motivo));
    }, ms);
    sinal.addEventListener("abort", aoAbortar, { once: true });
    promessa.then(
      (valor) => {
        encerrar();
        resolve(valor);
      },
      (erro) => {
        encerrar();
        reject(erro);
      }
    );
  });
}

/* ---------------------------------- fluxo ---------------------------------- */

/** O que o gerador usa do modelo: o Gemini em produção, um modelo falso nos testes. */
export type ModeloEmFluxo = Pick<Runnable<BaseMessage[], AIMessageChunk>, "stream">;

export interface OpcoesDoFluxo {
  /** Cancelamento do chamador (a tela fechou a conexão): interrompe a chamada à IA. */
  sinal?: AbortSignal;
  modelo?: ModeloEmFluxo;
  prazoPorTrechoMs?: number;
  prazoTotalMs?: number;
}

const modeloPadrao = (): ModeloEmFluxo =>
  createGeminiModel({ reasoningEffort: "medium" }).withConfig({ responseSchema: gemsOutputSchema });

function mensagens(pedido: PedidoExperiencias): BaseMessage[] {
  return [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      [
        `Destino: ${pedido.destino}`,
        `Mês da viagem: ${pedido.mes ?? "não informado"}`,
        pedido.contexto.length
          ? `Contexto da dupla:\n- ${pedido.contexto.join("\n- ")}`
          : "Contexto da dupla: sem preferências registradas.",
      ].join("\n")
    ),
  ];
}

type EventoDoModelo = Extract<EventoExperiencias, { tipo: "rascunho" | "experiencia" }>;

/**
 * As sugestões em fluxo, direto do modelo: rascunhos do card em escrita e
 * cada sugestão validada assim que fica completa. Lança `PrazoDaIaEsgotado`
 * se a IA travar, e o motivo do `sinal` se o chamador cancelar; em qualquer
 * saída antecipada, a requisição ao Gemini é abortada.
 */
export async function* gerarExperienciasEmFluxo(
  pedido: PedidoExperiencias,
  opcoes: OpcoesDoFluxo = {}
): AsyncGenerator<EventoDoModelo> {
  const { prazoPorTrechoMs = PRAZO_POR_TRECHO_MS, prazoTotalMs = PRAZO_TOTAL_MS } = opcoes;
  const controle = new AbortController();
  const aoCancelar = () => controle.abort(opcoes.sinal?.reason);
  opcoes.sinal?.addEventListener("abort", aoCancelar, { once: true });
  if (opcoes.sinal?.aborted) aoCancelar();
  const limiteTotal = Date.now() + prazoTotalMs;

  let iterador: AsyncIterator<AIMessageChunk> | null = null;
  let concluido = false;
  try {
    const modelo = opcoes.modelo ?? modeloPadrao();
    const ler = criarExtratorDeExperiencias();
    let texto = "";
    // O `stream()` da LangChain só resolve com o primeiro trecho: este é o
    // prazo de conectar e começar a responder.
    const fluxo = await aguardar(
      modelo.stream(mensagens(pedido), { signal: controle.signal }),
      prazoPorTrechoMs,
      "trecho",
      controle.signal
    );
    iterador = fluxo[Symbol.asyncIterator]();

    while (true) {
      const restante = limiteTotal - Date.now();
      const usarTotal = restante < prazoPorTrechoMs;
      const passo = await aguardar(
        iterador.next(),
        Math.max(0, usarTotal ? restante : prazoPorTrechoMs),
        usarTotal ? "total" : "trecho",
        controle.signal
      );
      if (passo.done) break;
      // Trechos de raciocínio ("thought") não entram no `.text`: só mantêm o prazo vivo.
      const novo = passo.value.text;
      if (!novo) continue;
      texto += novo;
      const leitura = ler(texto);
      for (const pronta of leitura.prontas) yield { tipo: "experiencia", ...pronta };
      if (leitura.rascunho) yield { tipo: "rascunho", ...leitura.rascunho };
    }
    concluido = true;
    for (const pronta of ler(texto, true).prontas) yield { tipo: "experiencia", ...pronta };
  } finally {
    opcoes.sinal?.removeEventListener("abort", aoCancelar);
    if (!concluido) {
      // Saída antecipada (prazo, cancelamento ou o consumidor parou): corta
      // a requisição ao Gemini e libera o leitor sem esperar por ele.
      if (!controle.signal.aborted) controle.abort(new DOMException("Fluxo encerrado.", "AbortError"));
      void iterador?.return?.()?.catch(() => {});
    }
  }
}

/**
 * O fluxo completo da rota: `inicio`, as sugestões (do cache ou da IA) e
 * `fim` | `erro`. Nunca lança: toda falha vira um evento `erro` com mensagem
 * em PT-BR (nada de detalhe interno). Cancelamento do chamador encerra o
 * fluxo em silêncio (não há mais ninguém para ler).
 *
 * Só guarda no cache uma resposta inteira (as 3 válidas). Com 1 ou 2 válidas,
 * mostra o que chegou e termina normalmente.
 */
export async function* eventosDasExperiencias(
  pedido: PedidoExperiencias,
  opcoes: OpcoesDoFluxo & { emCache?: LocalGem[] | null } = {}
): AsyncGenerator<EventoExperiencias> {
  yield { tipo: "inicio", destino: pedido.destino, contexto: pedido.contexto };

  if (opcoes.emCache?.length) {
    for (const [indice, experiencia] of opcoes.emCache.entries()) yield { tipo: "experiencia", indice, experiencia };
    yield { tipo: "fim" };
    return;
  }

  const validas: LocalGem[] = [];
  try {
    for await (const evento of gerarExperienciasEmFluxo(pedido, opcoes)) {
      if (evento.tipo === "experiencia") validas.push(evento.experiencia);
      yield evento;
    }
  } catch (erro) {
    if (opcoes.sinal?.aborted) return;
    yield { tipo: "erro", mensagem: mensagemDeFalha(erro, validas.length) };
    return;
  }

  if (validas.length === 0) {
    yield { tipo: "erro", mensagem: "A IA não trouxe sugestões válidas para este destino. Tente de novo." };
    return;
  }
  if (validas.length === QUANTIDADE_EXPERIENCIAS) guardarNoCache(pedido, validas);
  yield { tipo: "fim" };
}

function mensagemDeFalha(erro: unknown, jaEntregues: number): string {
  if (erro instanceof AiNotConfiguredError) return erro.message;
  const parcial = jaEntregues > 0 ? " As sugestões acima chegaram antes da falha." : "";
  if (erro instanceof PrazoDaIaEsgotado) {
    // Uma linha JSON, como os avisos de lentidão: dá para contar no log.
    console.warn(
      JSON.stringify({ nivel: "warn", evento: "ia_prazo_esgotado", recurso: "experiencias", motivo: erro.motivo, entregues: jaEntregues })
    );
    return `A IA demorou demais para responder.${parcial} Tente de novo em instantes.`;
  }
  console.error("[experiências] falha na IA:", erro);
  return `A IA não conseguiu terminar as sugestões agora.${parcial}`;
}
