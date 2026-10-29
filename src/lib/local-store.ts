"use client";

/**
 * Persistência local simples (localStorage) com fallback seguro.
 *
 * Usada enquanto a sincronização via Supabase não está ligada para estas
 * áreas: guarda configurações da conta e roteiro no navegador, para os dados
 * não se perderem ao recarregar a página. Nunca lança — se o storage estiver
 * indisponível (modo privado), apenas ignora.
 */

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
} as const;
