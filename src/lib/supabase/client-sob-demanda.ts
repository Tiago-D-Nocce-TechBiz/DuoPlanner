import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do navegador carregado sob demanda.
 *
 * O supabase-js com Realtime pesa ~270 KB (≈ 75 KB gzip) e entrava no
 * carregamento inicial de todas as telas do painel. Com `import()`, ele vira
 * um chunk à parte: o painel hidrata com a cópia local e o cliente chega logo
 * em seguida (em paralelo, e em cache depois da primeira visita).
 */

let carregando: Promise<SupabaseClient | null> | null = null;

export function obterSupabase(): Promise<SupabaseClient | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  carregando ??= import("./client")
    .then((m) => m.getSupabase())
    .catch(() => {
      // Falha ao baixar o chunk (offline na primeira visita): tenta de novo depois.
      carregando = null;
      return null;
    });
  return carregando;
}
