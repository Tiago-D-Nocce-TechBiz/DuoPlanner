import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para o browser.
 *
 * Usa `createBrowserClient` (@supabase/ssr), que lê a sessão dos MESMOS
 * cookies gravados pelo login no servidor. O `createClient` anterior guardava
 * a sessão no localStorage e nunca enxergava o login feito pelo servidor
 * (por isso a Nora cumprimentava "viajante").
 *
 * Usa a URL pública e a chave publishable/anon (seguras para o cliente — a
 * proteção real vem das políticas RLS no Supabase). Sem as variáveis (ex.:
 * build de CI sem segredos), `getSupabase()` devolve null e as features de
 * persistência degradam sem quebrar a UI.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  if (!url || !anonKey || typeof window === "undefined") return null;
  cached = createBrowserClient(url, anonKey);
  return cached;
}

/** Indica se o Supabase está configurado neste ambiente. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}
