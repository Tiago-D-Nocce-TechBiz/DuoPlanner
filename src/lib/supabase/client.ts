import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ambientePublico } from "@/lib/env/publico";

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
 *
 * Este módulo traz o supabase-js + Realtime (~270 KB): no navegador, importe
 * por `./client-sob-demanda` para ele não entrar no carregamento inicial.
 */

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const config = ambientePublico.supabase;
  if (!config || typeof window === "undefined") return null;
  cached = createBrowserClient(config.url, config.chavePublica);
  return cached;
}
