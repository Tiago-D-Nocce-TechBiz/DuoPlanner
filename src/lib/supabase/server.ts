import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 *
 * Usa a URL pública e a chave publishable/anon junto com os cookies da
 * requisição, então as políticas RLS continuam valendo (nenhuma service role
 * aqui). Crie um cliente novo por requisição; ele é leve.
 *
 * Devolve null quando as variáveis não estão definidas, para que as features
 * degradem sem quebrar a UI (mesmo comportamento do cliente do browser).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseServerConfigured(): boolean {
  return Boolean(url && key);
}

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!url || !key) return null;
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Chamado a partir de um Server Component, que não escreve cookies.
          // Pode ser ignorado: o proxy renova a sessão a cada requisição.
        }
      },
    },
  });
}

/**
 * Dono dos registros: o `sub` do JWT verificado por getClaims() (nunca
 * getSession() no servidor), ou null sem sessão.
 *
 * Para Server Actions e Route Handlers, prefira `obterSessao()`
 * (`@/lib/auth/sessao`), que já devolve cliente + usuário e a mensagem de
 * recusa. Esta função fica para leituras em Server Components.
 */
export async function getCurrentUserId(
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}
