"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { RespostaLote } from "@/app/dashboard/sincronizacao-actions";
import { falhaTransitoria, type ResultadoAcao } from "@/lib/acoes/resultado";
import { colunaAusente, tabelaAusente } from "@/lib/auth/seguranca";
import { adicionarNotificacao } from "@/lib/notifications/store";
import { EVENTO_DADOS_LIMPOS } from "@/lib/privacidade/limpeza-local";
// Sob demanda: o supabase-js (~270 KB) não entra no carregamento do painel.
import { obterSupabase } from "@/lib/supabase/client-sob-demanda";
import { acordoDaLinha, type ContextoSincronizacao } from "./contexto";
import { derivar, enfileirar, type Operacao } from "./fila";
import {
  COLUNAS,
  DA_LINHA,
  RECURSOS,
  RECURSO_POR_TABELA,
  TABELAS,
  autorDaAlteracao,
  maisRecente,
  type Recurso,
  type Registro,
  type RegistroPorRecurso,
} from "./modelos";

/**
 * Motor de sincronização do casal (navegador).
 *
 * - Leitura: cliente Supabase do navegador (RLS) + Realtime por espaço.
 * - Escrita: fila de operações persistida no aparelho (`pd-sync:<uid>`) e
 *   enviada em lotes à Server Action `sincronizarOperacoes`. Offline, a fila
 *   cresce e a tela continua funcionando; quando a rede volta, ela é enviada.
 * - Conflitos: vence o `atualizado_em` mais recente do banco.
 * - Banco sem a migration: "modo local" (a fila espera, nada se perde).
 *
 * Estado em módulo (um por aba) exposto via useSyncExternalStore.
 */

export type ModoSync = "inativo" | "carregando" | "nuvem" | "local";

export interface StatusSync {
  modo: ModoSync;
  online: boolean;
  pendentes: number;
  /**
   * Identificador do ciclo de pendência atual (muda quando a fila sai de
   * vazia para não vazia); null = nada pendente. Permite à tela esperar um
   * pouco antes de mostrar "Salvando…" sem piscar a cada toque.
   */
  pendenteDesde: number | null;
  enviando: boolean;
  /** O servidor não respondeu na última tentativa (rede ou instabilidade). */
  semServidor: boolean;
  ultimoErro: string | null;
  ultimaSincronizacao: string | null;
}

type Servidor = { [R in Recurso]: Map<string, RegistroPorRecurso[R]> };

const LOTE = 25;
const ESPERA_ENVIO_MS = 700;
const RETENTATIVAS_MS = [2000, 5000, 10_000, 30_000, 60_000];

function servidorVazio(): Servidor {
  return {
    despesas: new Map(),
    roteiro_dias: new Map(),
    roteiro_itens: new Map(),
    checklist: new Map(),
    alertas: new Map(),
  };
}

const estado = {
  contexto: null as ContextoSincronizacao | null,
  modo: "inativo" as ModoSync,
  online: true,
  servidor: servidorVazio(),
  fila: [] as Operacao[],
  pendenteDesde: null as number | null,
  emVoo: new Set<string>(),
  enviando: false,
  semServidor: false,
  ultimoErro: null as string | null,
  ultimaSincronizacao: null as string | null,
};

let cicloPendente = 0;

/**
 * Quem envia o lote ao servidor: a Server Action `sincronizarOperacoes`,
 * injetada pelo provider. O motor não a importa direto para continuar
 * importável em testes e pela Nora (lógica pura) sem puxar código de servidor.
 */
export type EnviadorLote = (lote: { ops: Operacao[] }) => Promise<ResultadoAcao<RespostaLote>>;
let enviador: EnviadorLote | null = null;

let canal: RealtimeChannel | null = null;
let temporizadorEnvio: ReturnType<typeof setTimeout> | null = null;
let temporizadorPersistir: ReturnType<typeof setTimeout> | null = null;
let tentativa = 0;
let removerOuvintes: (() => void) | null = null;

/* ----------------------------- assinaturas ----------------------------- */

const ouvintes = new Set<() => void>();
let versao = 0;
let cacheListas: { versao: number; listas: Partial<Record<Recurso, Registro[]>> } = { versao: -1, listas: {} };
let cacheStatus: { versao: number; status: StatusSync } | null = null;

function mudou() {
  // Um ciclo de pendência começa quando a fila deixa de estar vazia.
  if (estado.fila.length === 0) estado.pendenteDesde = null;
  else if (estado.pendenteDesde === null) estado.pendenteDesde = ++cicloPendente;
  versao++;
  for (const ouvinte of ouvintes) ouvinte();
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function lista<R extends Recurso>(recurso: R): RegistroPorRecurso[R][] {
  if (cacheListas.versao !== versao) cacheListas = { versao, listas: {} };
  const pronta = cacheListas.listas[recurso];
  if (pronta) return pronta as RegistroPorRecurso[R][];
  const nova = derivar(estado.servidor[recurso] as Map<string, RegistroPorRecurso[R]>, estado.fila, recurso);
  cacheListas.listas[recurso] = nova;
  return nova;
}

function status(): StatusSync {
  if (cacheStatus?.versao === versao) return cacheStatus.status;
  const s: StatusSync = {
    modo: estado.modo,
    online: estado.online,
    pendentes: estado.fila.length,
    pendenteDesde: estado.pendenteDesde,
    enviando: estado.enviando,
    semServidor: estado.semServidor,
    ultimoErro: estado.ultimoErro,
    ultimaSincronizacao: estado.ultimaSincronizacao,
  };
  cacheStatus = { versao, status: s };
  return s;
}

const VAZIO: never[] = [];
const STATUS_SERVIDOR: StatusSync = {
  modo: "inativo",
  online: true,
  pendentes: 0,
  pendenteDesde: null,
  enviando: false,
  semServidor: false,
  ultimoErro: null,
  ultimaSincronizacao: null,
};

/* ----------------------------- persistência ----------------------------- */

const chave = (userId: string) => `pd-sync:${userId}`;

interface Persistido {
  v: 1;
  workspaceId: string | null;
  servidor: Partial<Record<Recurso, Registro[]>>;
  fila: Operacao[];
  ultimaSincronizacao: string | null;
}

function persistirJa() {
  const ctx = estado.contexto;
  if (!ctx || typeof window === "undefined") return;
  const dados: Persistido = {
    v: 1,
    workspaceId: ctx.workspace?.id ?? null,
    servidor: Object.fromEntries(RECURSOS.map((r) => [r, [...estado.servidor[r].values()]])),
    fila: estado.fila,
    ultimaSincronizacao: estado.ultimaSincronizacao,
  };
  try {
    window.localStorage.setItem(chave(ctx.userId), JSON.stringify(dados));
  } catch {
    // Storage cheio ou indisponível: a fila segue em memória nesta sessão.
  }
}

function persistir() {
  if (temporizadorPersistir) clearTimeout(temporizadorPersistir);
  temporizadorPersistir = setTimeout(() => {
    temporizadorPersistir = null;
    persistirJa();
  }, 250);
}

/**
 * Grava já o que espera a gravação adiada (250 ms). Chamado ao ocultar ou
 * fechar a página: sem isso, uma alteração feita logo antes de fechar a aba
 * ficava só na memória e se perdia.
 */
export function persistirAgora() {
  if (!temporizadorPersistir) return;
  clearTimeout(temporizadorPersistir);
  temporizadorPersistir = null;
  persistirJa();
}

function carregarPersistido(ctx: ContextoSincronizacao) {
  estado.servidor = servidorVazio();
  estado.fila = [];
  try {
    const bruto = window.localStorage.getItem(chave(ctx.userId));
    if (!bruto) return;
    const dados = JSON.parse(bruto) as Persistido;
    if (dados.v !== 1) return;
    estado.fila = Array.isArray(dados.fila) ? dados.fila : [];
    estado.ultimaSincronizacao = dados.ultimaSincronizacao ?? null;
    // Snapshot de outro espaço (ex.: acabou de aceitar um convite) não vale.
    if (dados.workspaceId !== (ctx.workspace?.id ?? null)) return;
    for (const r of RECURSOS) {
      for (const registro of dados.servidor[r] ?? []) {
        (estado.servidor[r] as Map<string, Registro>).set(registro.id, registro);
      }
    }
  } catch {
    // Persistência corrompida: recomeça do servidor.
  }
}

/* ------------------------------- leitura ------------------------------- */

/** O motor ainda é da mesma conta e do mesmo espaço (nada trocou durante um await). */
function mesmoEscopo(userId: string, ws: string | null): boolean {
  return estado.contexto?.userId === userId && (estado.contexto.workspace?.id ?? null) === ws;
}

async function carregarRecurso(recurso: Recurso): Promise<"ok" | "ausente" | "erro"> {
  const ctx = estado.contexto;
  if (!ctx) return "erro";
  const ws = ctx.workspace?.id ?? null;
  const supabase = await obterSupabase();
  if (!supabase || !mesmoEscopo(ctx.userId, ws)) return "erro";
  const tabela = TABELAS[recurso];
  let consulta = supabase.from(tabela).select(COLUNAS[recurso]);

  if (recurso === "despesas") {
    consulta = ws
      ? consulta.or(`workspace_id.eq.${ws},and(user_id.eq.${ctx.userId},escopo.eq.pessoal_privado)`)
      : consulta.eq("user_id", ctx.userId);
  } else if (recurso === "alertas") {
    consulta = ws ? consulta.or(`workspace_id.eq.${ws},user_id.eq.${ctx.userId}`) : consulta.eq("user_id", ctx.userId);
  } else {
    if (!ws) {
      estado.servidor[recurso].clear();
      return "ok";
    }
    consulta = consulta.eq("workspace_id", ws);
  }

  const { data, error } = await consulta.limit(2000);
  // Tabela ou coluna desta versão ainda não existe no banco: modo local.
  if (error) return tabelaAusente(error) || colunaAusente(error) ? "ausente" : "erro";
  if (!mesmoEscopo(ctx.userId, ws)) return "erro"; // trocou de conta ou de espaço no meio da consulta

  // Substitui o snapshot, mas sem regredir: se um evento do Realtime trouxe uma
  // versão mais nova durante a consulta, ela vence.
  const atual = estado.servidor[recurso] as Map<string, Registro>;
  const mapa = new Map<string, Registro>();
  const mapear = DA_LINHA[recurso] as (l: Record<string, unknown>) => Registro;
  for (const linha of (data ?? []) as unknown as Record<string, unknown>[]) {
    const registro = mapear(linha);
    const conhecido = atual.get(registro.id);
    mapa.set(registro.id, conhecido && !maisRecente(registro, conhecido) ? conhecido : registro);
  }
  (estado.servidor as Record<Recurso, Map<string, Registro>>)[recurso] = mapa;
  return "ok";
}

async function carregarTudo() {
  if (!estado.contexto?.servidorPronto) return;
  const resultados = await Promise.all(RECURSOS.map(carregarRecurso));
  if (resultados.includes("ausente")) {
    estado.modo = "local";
  } else if (resultados.includes("erro")) {
    estado.semServidor = true;
    estado.ultimoErro = "Sem conexão com o servidor: mostrando a última cópia salva neste aparelho.";
    if (estado.modo === "carregando") estado.modo = "nuvem";
  } else {
    estado.modo = "nuvem";
    estado.semServidor = false;
    if (estado.ultimoErro?.startsWith("Sem conexão")) estado.ultimoErro = null;
  }
  persistir();
  mudou();
  agendarEnvio(0);
}

/* ------------------------------- realtime ------------------------------- */

function nomeDe(userId: string | null): string {
  return estado.contexto?.membros.find((m) => m.userId === userId)?.nome ?? "Seu par";
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function notificarParceiro(recurso: Recurso, registro: Registro) {
  const autor = autorDaAlteracao(registro);
  const quem = nomeDe(autor);
  if (recurso === "despesas") {
    const d = registro as RegistroPorRecurso["despesas"];
    if (d.escopo !== "viagem_compartilhado") return;
    adicionarNotificacao(
      d.tipo === "acerto"
        ? { tipo: "financas", titulo: `${quem} registrou um acerto`, descricao: `${brl(d.valor)} enviados no acerto de contas.`, href: "/dashboard/acerto", origem: quem }
        : { tipo: "financas", titulo: `${quem} adicionou um gasto da viagem`, descricao: `${d.descricao} — ${d.moeda === "BRL" ? brl(d.valor) : `${d.moeda} ${d.valor.toFixed(2)}`}`, href: "/dashboard/financas", origem: quem }
    );
  } else if (recurso === "checklist") {
    const c = registro as RegistroPorRecurso["checklist"];
    adicionarNotificacao({ tipo: "geral", titulo: `${quem} incluiu no checklist`, descricao: c.texto, href: "/dashboard/checklist", origem: quem });
  } else if (recurso === "roteiro_itens") {
    const i = registro as RegistroPorRecurso["roteiro_itens"];
    if (!i.titulo) return;
    adicionarNotificacao({ tipo: "roteiro", titulo: `${quem} mexeu no roteiro`, descricao: i.titulo, href: "/dashboard/roteiro", origem: quem });
  } else if (recurso === "alertas") {
    const a = registro as RegistroPorRecurso["alertas"];
    adicionarNotificacao({ tipo: "geral", titulo: `${quem} criou um alerta de preço`, descricao: a.destino, href: "/dashboard/alertas", origem: quem });
  }
}

function aoMudarNoBanco(payload: RealtimePostgresChangesPayload<Record<string, unknown>>) {
  const ctx = estado.contexto;
  if (!ctx) return;

  if (payload.table === "acordos_divisao") {
    if (payload.eventType !== "DELETE") {
      // Novo objeto: o useSyncExternalStore compara por referência.
      estado.contexto = { ...ctx, acordo: acordoDaLinha(payload.new) };
      mudou();
    }
    return;
  }

  const recurso = RECURSO_POR_TABELA[payload.table];
  if (!recurso) return;
  const mapa = estado.servidor[recurso] as Map<string, Registro>;

  if (payload.eventType === "DELETE") {
    const id = (payload.old as { id?: unknown })?.id;
    if (typeof id === "string" && mapa.delete(id)) {
      persistir();
      mudou();
    }
    return;
  }

  const registro = (DA_LINHA[recurso] as (l: Record<string, unknown>) => Registro)(payload.new);
  if (!registro.id) return;
  // Gasto privado de outra pessoa nunca deveria chegar (RLS); se chegar, ignora.
  if (recurso === "despesas") {
    const d = registro as RegistroPorRecurso["despesas"];
    if (d.escopo === "pessoal_privado" && d.userId !== ctx.userId) return;
  }
  if (!maisRecente(registro, mapa.get(registro.id))) return;
  mapa.set(registro.id, registro);
  persistir();
  mudou();

  const autor = autorDaAlteracao(registro);
  if (payload.eventType === "INSERT" && autor && autor !== ctx.userId) notificarParceiro(recurso, registro);
}

async function assinarRealtime() {
  const ctx = estado.contexto;
  const ws = ctx?.workspace?.id;
  if (!ctx || !ws || canal) return;
  const supabase = await obterSupabase();
  // Enquanto o cliente carregava, o motor pode ter parado ou trocado de espaço.
  if (!supabase || canal || estado.contexto?.workspace?.id !== ws || removerOuvintes === null) return;

  // Garante que o Realtime use o token da sessão (RLS por assinante).
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) supabase.realtime.setAuth(data.session.access_token);
  } catch {
    // segue: a biblioteca também atualiza o token sozinha
  }

  let novoCanal = supabase.channel(`pd-ws-${ws}`);
  for (const tabela of [...Object.values(TABELAS), "acordos_divisao"]) {
    novoCanal = novoCanal.on(
      "postgres_changes",
      { event: "*", schema: "public", table: tabela, filter: `workspace_id=eq.${ws}` },
      aoMudarNoBanco
    );
  }
  let primeiraVez = true;
  canal = novoCanal.subscribe((situacao) => {
    if (situacao === "SUBSCRIBED") {
      // Reconectou depois de uma queda: busca o que pode ter passado.
      if (!primeiraVez) void carregarTudo();
      primeiraVez = false;
    }
  });
}

function cancelarRealtime() {
  const ativo = canal;
  if (!ativo) return;
  canal = null;
  void obterSupabase().then((supabase) => supabase?.removeChannel(ativo));
}

/* -------------------------------- envio -------------------------------- */

function agendarEnvio(atraso = ESPERA_ENVIO_MS) {
  if (temporizadorEnvio) clearTimeout(temporizadorEnvio);
  temporizadorEnvio = setTimeout(() => void enviar(), atraso);
}

function retentar(mensagem: string) {
  estado.ultimoErro = mensagem;
  const espera = RETENTATIVAS_MS[Math.min(tentativa, RETENTATIVAS_MS.length - 1)];
  tentativa++;
  agendarEnvio(espera);
}

async function enviar() {
  if (!enviador || estado.enviando || estado.modo !== "nuvem" || estado.fila.length === 0) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const lote = estado.fila.slice(0, LOTE);
  estado.emVoo = new Set(lote.map((op) => op.opId));
  estado.enviando = true;
  mudou();

  let chamada: ResultadoAcao<RespostaLote>;
  try {
    chamada = await enviador({ ops: lote });
  } catch {
    estado.enviando = false;
    estado.emVoo = new Set();
    estado.semServidor = true;
    retentar("Sem conexão. As alterações ficam guardadas neste aparelho e vão assim que a internet voltar.");
    mudou();
    return;
  }
  estado.enviando = false;
  estado.emVoo = new Set();

  if (!chamada.success) {
    if (falhaTransitoria(chamada)) {
      // Servidor instável (ou erro inesperado lá): a fila espera e tenta de novo.
      estado.semServidor = true;
      retentar(chamada.error);
    } else {
      estado.ultimoErro =
        chamada.code === "NAO_AUTENTICADO"
          ? "Sua sessão expirou. Entre de novo para sincronizar as alterações guardadas."
          : chamada.error;
    }
    mudou();
    return;
  }
  const resposta = chamada.data;
  estado.semServidor = false;
  if (resposta.indisponivel) estado.modo = "local";

  const porOperacao = new Map(resposta.resultados.map((r) => [r.opId, r]));
  const rejeitadas: string[] = [];
  const recarregar = new Set<Recurso>();
  let adiadas = 0;

  estado.fila = estado.fila.filter((op) => {
    const r = porOperacao.get(op.opId);
    if (!r) return true; // não processada (lote interrompido): continua na fila
    if (r.status === "adiada") {
      adiadas++;
      return true;
    }
    const mapa = estado.servidor[op.recurso] as Map<string, Registro>;
    if (r.status === "aplicada") {
      if (op.tipo === "remover") {
        mapa.delete(op.id);
        if (op.recurso === "roteiro_dias") {
          for (const item of estado.servidor.roteiro_itens.values()) {
            if (item.diaId === op.id) estado.servidor.roteiro_itens.delete(item.id);
          }
        }
      } else if (r.registro && maisRecente(r.registro, mapa.get(r.registro.id))) {
        mapa.set(r.registro.id, r.registro);
      }
      return false;
    }
    // Duplicata da fatura (outra aba ou aparelho já gravou a mesma compra):
    // some em silêncio; a recarga traz a cópia que já está no servidor.
    if (r.motivo !== "duplicado") rejeitadas.push(r.mensagem);
    recarregar.add(op.recurso);
    return false;
  });

  estado.ultimaSincronizacao = new Date().toISOString();
  estado.ultimoErro = rejeitadas.length
    ? `Uma alteração não foi salva: ${rejeitadas[0]}`
    : adiadas
      ? "O servidor não respondeu agora. Tentaremos de novo."
      : null;
  if (!rejeitadas.length && !adiadas) tentativa = 0;
  persistir();
  mudou();

  for (const r of recarregar) void carregarRecurso(r).then(() => mudou());
  if (adiadas) retentar(estado.ultimoErro ?? "Tentaremos de novo.");
  else if (estado.fila.length && estado.modo === "nuvem") agendarEnvio(0);
}

/* ------------------------------ ciclo de vida ------------------------------ */

function aoFicarOnline() {
  estado.online = true;
  tentativa = 0;
  mudou();
  void carregarTudo();
}

function aoFicarOffline() {
  estado.online = false;
  mudou();
}

function aoMudarVisibilidade() {
  // No celular, sair do app pode encerrar a página sem aviso: grava antes.
  if (document.visibilityState === "hidden") return persistirAgora();
  if (estado.modo !== "inativo") void carregarTudo();
}

function aoLimparDados() {
  // Sem contexto primeiro: nenhuma gravação pendente reescreve o que o logout
  // acabou de apagar (persistirJa sai cedo sem contexto).
  estado.contexto = null;
  encerrarSincronizacao();
  estado.servidor = servidorVazio();
  estado.fila = [];
  estado.modo = "inativo";
  estado.ultimoErro = null;
  estado.ultimaSincronizacao = null;
  mudou();
}

/** Liga o motor para o usuário/espaço do contexto (idempotente). */
export function iniciarSincronizacao(ctx: ContextoSincronizacao, opcoes: { enviar: EnviadorLote }) {
  enviador = opcoes.enviar;
  const anterior = estado.contexto;
  const ativo = removerOuvintes !== null;
  if (ativo && anterior && anterior.userId === ctx.userId && anterior.workspace?.id === ctx.workspace?.id) {
    estado.contexto = ctx;
    if (ctx.servidorPronto && estado.modo === "local") {
      estado.modo = "carregando";
      void carregarTudo();
      void assinarRealtime();
    }
    mudou();
    return;
  }

  encerrarSincronizacao();
  const mesmoUsuario = anterior?.userId === ctx.userId && anterior?.workspace?.id === ctx.workspace?.id;
  estado.contexto = ctx;
  estado.online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  // Remontagem (mesmo usuário e espaço): o estado em memória é mais novo que
  // o persistido (a gravação é adiada em 250 ms). Só lê do disco ao trocar.
  if (!mesmoUsuario) carregarPersistido(ctx);
  estado.modo = ctx.servidorPronto ? "carregando" : "local";
  estado.ultimoErro = null;
  mudou();

  window.addEventListener("online", aoFicarOnline);
  window.addEventListener("offline", aoFicarOffline);
  document.addEventListener("visibilitychange", aoMudarVisibilidade);
  window.addEventListener("pagehide", persistirAgora);
  window.addEventListener(EVENTO_DADOS_LIMPOS, aoLimparDados);
  removerOuvintes = () => {
    window.removeEventListener("online", aoFicarOnline);
    window.removeEventListener("offline", aoFicarOffline);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    window.removeEventListener("pagehide", persistirAgora);
    window.removeEventListener(EVENTO_DADOS_LIMPOS, aoLimparDados);
  };

  if (ctx.servidorPronto) {
    void carregarTudo();
    void assinarRealtime();
  }
}

export function encerrarSincronizacao() {
  cancelarRealtime();
  if (temporizadorEnvio) clearTimeout(temporizadorEnvio);
  if (temporizadorPersistir) {
    clearTimeout(temporizadorPersistir);
    persistirJa();
  }
  temporizadorEnvio = null;
  temporizadorPersistir = null;
  removerOuvintes?.();
  removerOuvintes = null;
}

/** Atualiza partes do contexto (perfil salvo, acordo alterado...). */
export function atualizarContexto(parcial: Partial<ContextoSincronizacao>) {
  if (!estado.contexto) return;
  estado.contexto = { ...estado.contexto, ...parcial };
  mudou();
}

/* ------------------------------- mutações ------------------------------- */

function novoOpId(): string {
  return crypto.randomUUID();
}

const existeNoServidor = (recurso: Recurso, id: string) => estado.servidor[recurso].has(id);

function aplicar(op: Operacao) {
  estado.fila = enfileirar(estado.fila, op, estado.emVoo, existeNoServidor);
  persistir();
  mudou();
  agendarEnvio();
}

export function criarRegistro<R extends Recurso>(recurso: R, registro: RegistroPorRecurso[R]) {
  const comCarimbo = { ...registro, atualizadoEm: new Date().toISOString(), atualizadoPor: estado.contexto?.userId ?? null };
  aplicar({ opId: novoOpId(), recurso, tipo: "criar", registro: comCarimbo as unknown as { id: string } & Record<string, unknown> });
}

export function atualizarRegistro<R extends Recurso>(recurso: R, id: string, campos: Partial<RegistroPorRecurso[R]>) {
  aplicar({ opId: novoOpId(), recurso, tipo: "atualizar", id, campos: campos as Record<string, unknown> });
}

export function removerRegistro(recurso: Recurso, id: string) {
  aplicar({ opId: novoOpId(), recurso, tipo: "remover", id });
}

/** Acrescenta operações já validadas (importação dos dados antigos). */
export function enfileirarOperacoes(operacoes: Operacao[]) {
  for (const op of operacoes) estado.fila = enfileirar(estado.fila, op, estado.emVoo, existeNoServidor);
  persistirJa();
  mudou();
  agendarEnvio(0);
}

/** Tenta enviar já (botão "Sincronizar agora"). */
export function sincronizarAgora() {
  tentativa = 0;
  if (estado.modo === "local" && estado.contexto?.servidorPronto) estado.modo = "nuvem";
  void enviar();
}

/* --------------------------------- leitura --------------------------------- */

export function getRegistros<R extends Recurso>(recurso: R): RegistroPorRecurso[R][] {
  return lista(recurso);
}

export function getContexto(): ContextoSincronizacao | null {
  return estado.contexto;
}

export function getStatus(): StatusSync {
  return status();
}

export function useRegistros<R extends Recurso>(recurso: R): RegistroPorRecurso[R][] {
  return useSyncExternalStore(
    assinar,
    () => lista(recurso),
    () => VAZIO as RegistroPorRecurso[R][]
  );
}

export function useStatusSync(): StatusSync {
  return useSyncExternalStore(assinar, status, () => STATUS_SERVIDOR);
}

export function useContextoSync(): ContextoSincronizacao | null {
  return useSyncExternalStore(
    assinar,
    () => estado.contexto,
    () => null
  );
}
