"use client";

/**
 * Persistência local simples (localStorage) com fallback seguro.
 *
 * Usada enquanto a sincronização via Supabase não está ligada para estas
 * áreas: guarda configurações da conta e roteiro no navegador, para os dados
 * não se perderem ao recarregar a página. Nunca lança — se o storage estiver
 * indisponível (modo privado), apenas ignora.
 */

import { useSyncExternalStore } from "react";
import { todayInSaoPaulo } from "@/lib/dates";

/**
 * Hook `useMontado`: devolve false no servidor e no primeiro render do cliente,
 * e true após a hidratação — sem setState em efeito (compatível com a regra
 * react-hooks/set-state-in-effect). Use para só então ler `localStorage`,
 * evitando hydration mismatch.
 */
const noop = () => () => {};
export function useMontado(): boolean {
  return useSyncExternalStore(
    noop,
    () => true, // snapshot no cliente
    () => false // snapshot no servidor
  );
}

/**
 * "Hoje" (AAAA-MM-DD, fuso de São Paulo) só no cliente; "" no prerender.
 * Com Cache Components, `new Date()` durante o prerender de um Client
 * Component quebra o build (valor instável): a data entra depois da montagem.
 */
export function useHoje(): string {
  return useSyncExternalStore(noop, () => todayInSaoPaulo(), () => "");
}

export function readLocal<T>(chave: string, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

export function writeLocal<T>(chave: string, valor: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Storage indisponível (modo privado/limites): ignora silenciosamente.
  }
}

/** Chaves usadas pela aplicação (evita strings soltas espalhadas). */
export const STORAGE_KEYS = {
  conta: "pd-configuracoes-conta",
  roteiro: "pd-roteiro",
  concierge: "pd-concierge-preenchimento",
  checklist: "pd-checklist",
  documentos: "pd-documentos",
  viagem: "pd-viagem-resumo",
  alertas: "pd-alertas-preco",
} as const;
