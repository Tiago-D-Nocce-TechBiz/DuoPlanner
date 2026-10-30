"use client";

/**
 * Store de notificações (localStorage + reativo).
 *
 * Mostra ao usuário quando o parceiro(a) vincula algo ao espaço compartilhado:
 * um gasto/finança, um documento anexado, ou um item de roteiro. Hoje grava e
 * lê localmente; quando a sincronização em tempo real do Supabase estiver
 * ligada, basta chamar `adicionarNotificacao` ao receber o evento do parceiro
 * (o resto da UI — sino, contador, lista — já funciona).
 */

import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "@/lib/local-store";

export type TipoNotificacao = "financas" | "documento" | "roteiro" | "geral";

export interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  descricao: string;
  /** ISO timestamp de criação. */
  criadaEm: string;
  lida: boolean;
  /** Link opcional para abrir o item relacionado. */
  href?: string;
  /** Quem originou (ex.: nome do parceiro). */
  origem?: string;
}

const CHAVE = "pd-notificacoes";
const EVENTO = "pd-notificacoes-change";

function emitir() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

function idAleatorio(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function getNotificacoes(): Notificacao[] {
  return readLocal<Notificacao[]>(CHAVE, []);
}

/** Adiciona uma notificação no topo (ex.: parceiro vinculou um gasto). */
export function adicionarNotificacao(
  n: Omit<Notificacao, "id" | "criadaEm" | "lida">
): Notificacao {
  const nova: Notificacao = {
    ...n,
    id: idAleatorio(),
    criadaEm: new Date().toISOString(),
    lida: false,
  };
  const atual = getNotificacoes();
  writeLocal(CHAVE, [nova, ...atual].slice(0, 50)); // mantém no máx. 50
  emitir();
  return nova;
}

export function marcarComoLida(id: string): void {
  writeLocal(
    CHAVE,
    getNotificacoes().map((n) => (n.id === id ? { ...n, lida: true } : n))
  );
  emitir();
}

export function marcarTodasComoLidas(): void {
  writeLocal(CHAVE, getNotificacoes().map((n) => ({ ...n, lida: true })));
  emitir();
}

export function limparNotificacoes(): void {
  writeLocal(CHAVE, []);
  emitir();
}

/* ----------------------------- Hook reativo ------------------------------ */

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(EVENTO, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EVENTO, h);
    window.removeEventListener("storage", h);
  };
}

let cacheBruto = "";
let cacheLista: Notificacao[] = [];

function getSnapshot(): Notificacao[] {
  if (typeof window === "undefined") return cacheLista;
  const bruto = window.localStorage.getItem(CHAVE) ?? "[]";
  if (bruto !== cacheBruto) {
    cacheBruto = bruto;
    try {
      cacheLista = JSON.parse(bruto) as Notificacao[];
    } catch {
      cacheLista = [];
    }
  }
  return cacheLista;
}

function getServerSnapshot(): Notificacao[] {
  return [];
}

export function useNotificacoes(): Notificacao[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
