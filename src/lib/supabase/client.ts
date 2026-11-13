import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ambientePublico } from "@/lib/env/publico";
import { fetchComPrazo } from "@/lib/http/fetch-com-limite";

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

/**
 * Prazo por requisição HTTP no navegador (o Realtime usa WebSocket e não
 * entra). Em rede móvel parada, a leitura falha e o motor de sincronização
 * passa para "sem servidor" e tenta de novo, em vez de esperar para sempre.
 */
const PRAZO_SUPABASE_NAVEGADOR_MS = 15_000;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const config = ambientePublico.supabase;
  if (!config || typeof window === "undefined") return null;
  cached = createBrowserClient(config.url, config.chavePublica, {
    global: { fetch: fetchComPrazo(PRAZO_SUPABASE_NAVEGADOR_MS) },
  });
  return cached;
}
