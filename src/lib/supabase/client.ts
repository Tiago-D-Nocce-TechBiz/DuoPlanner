import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para o browser.
 *
 * Usa a URL pública e a chave publishable/anon (seguras para o cliente — a
 * proteção real vem das políticas RLS no Supabase). As variáveis vivem em
 * `.env.local` (NEXT_PUBLIC_*), que está no .gitignore.
 *
 * Caso as variáveis não estejam definidas (ex.: build de CI sem segredos),
 * `getSupabase()` devolve null e as features de persistência degradam
 * graciosamente sem quebrar a UI.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  if (!url || !anonKey) return null;
  cached = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return cached;
}

/** Indica se o Supabase está configurado neste ambiente. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}
