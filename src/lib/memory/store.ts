import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";
import {
  describePreference,
  parsePreference,
  type DuoPreferences,
  type PreferenceKey,
} from "./preferences";

/**
 * Memória da dupla no Supabase (Agente de Contexto e Memória).
 *
 * - `preferencias_duo`: estado consolidado (uma linha por chave).
 * - `memoria_ia`: histórico cronológico do que a dupla contou à IA e do que a
 *   IA fez (ex.: recibos lidos). Dá contexto e transparência (LGPD).
 *
 * Todas as funções degradam: sem Supabase configurado, devolvem memória vazia.
 */

export interface PreferenceItem {
  chave: PreferenceKey;
  valor: unknown;
  descricao: string;
  origem: "ia" | "usuario";
  updatedAt: string;
}

export type MemoryEntryKind = "preferencia" | "recibo";

export interface MemoryEntry {
  id: string;
  tipo: string;
  resumo: string;
  createdAt: string;
}

export interface DuoMemory {
  configured: boolean;
  userId: string | null;
  preferences: DuoPreferences;
  items: PreferenceItem[];
  history: MemoryEntry[];
  error?: string;
}

const EMPTY: Omit<DuoMemory, "configured"> = {
  userId: null,
  preferences: {},
  items: [],
  history: [],
};

/** Carrega preferências + histórico recente do dono atual (ou da dupla única). */
export async function loadDuoMemory(options?: {
  historyLimit?: number;
}): Promise<DuoMemory> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { configured: false, ...EMPTY };
  const userId = await getCurrentUserId(supabase);
  return readDuoMemory(supabase, userId, options?.historyLimit ?? 8);
}

/** Mesma leitura, com um cliente já criado (usado pelos agentes LangGraph). */
export async function readDuoMemory(
  supabase: SupabaseClient,
  userId: string | null,
  historyLimit = 8
): Promise<DuoMemory> {
  const prefQuery = supabase
    .from("preferencias_duo")
    .select("chave, valor, descricao, origem, updated_at");
  const histQuery = supabase
    .from("memoria_ia")
    .select("id, tipo, resumo, created_at")
    .order("created_at", { ascending: false })
    .limit(historyLimit);

  const [prefs, hist] = await Promise.all([
    userId ? prefQuery.eq("user_id", userId) : prefQuery.is("user_id", null),
    historyLimit > 0
      ? userId
        ? histQuery.eq("user_id", userId)
        : histQuery.is("user_id", null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = prefs.error?.message ?? hist.error?.message;
  const preferences: DuoPreferences = {};
  const items: PreferenceItem[] = [];

  for (const row of prefs.data ?? []) {
    const parsed = parsePreference(row.chave, row.valor);
    if (!parsed) continue; // ignora linhas antigas/inválidas
    (preferences as Record<string, unknown>)[parsed.key] = parsed.value;
    items.push({
      chave: parsed.key,
      valor: parsed.value,
      descricao:
        typeof row.descricao === "string" && row.descricao
          ? row.descricao
          : describePreference(parsed.key, parsed.value),
      origem: row.origem === "usuario" ? "usuario" : "ia",
      updatedAt: String(row.updated_at ?? ""),
    });
  }

  const history: MemoryEntry[] = (hist.data ?? []).map((row) => ({
    id: String(row.id),
    tipo: String(row.tipo),
    resumo: String(row.resumo),
    createdAt: String(row.created_at),
  }));

  return { configured: true, userId, preferences, items, history, error };
}

/** Grava (upsert) preferências validadas. */
export async function upsertPreferences(
  supabase: SupabaseClient,
  userId: string | null,
  updates: DuoPreferences,
  origem: "ia" | "usuario"
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const rows = Object.entries(updates)
    .map(([chave, valor]) => parsePreference(chave, valor))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map(({ key, value }) => ({
      user_id: userId,
      chave: key,
      valor: value,
      descricao: describePreference(key, value),
      origem,
      updated_at: now,
    }));

  if (rows.length === 0) return {};
  const { error } = await supabase
    .from("preferencias_duo")
    .upsert(rows, { onConflict: "user_id,chave" });
  return error ? { error: error.message } : {};
}

/** Remove preferências ("esquecer"). */
export async function deletePreferences(
  supabase: SupabaseClient,
  userId: string | null,
  keys: PreferenceKey[]
): Promise<{ error?: string }> {
  if (keys.length === 0) return {};
  const query = supabase.from("preferencias_duo").delete().in("chave", keys);
  const { error } = await (userId
    ? query.eq("user_id", userId)
    : query.is("user_id", null));
  return error ? { error: error.message } : {};
}

/** Acrescenta uma entrada ao histórico. Best-effort: falhas só são logadas. */
export async function appendMemoryEntry(
  supabase: SupabaseClient,
  userId: string | null,
  entry: { tipo: MemoryEntryKind; resumo: string; dados?: Record<string, unknown> }
): Promise<void> {
  const { error } = await supabase.from("memoria_ia").insert({
    user_id: userId,
    tipo: entry.tipo,
    resumo: entry.resumo.slice(0, 500),
    dados: entry.dados ?? {},
  });
  if (error) console.error("[memoria_ia] falha ao registrar:", error.message);
}

/**
 * Só as preferências, sem histórico. Nunca lança: uma falha na memória não
 * pode derrubar uma busca de voos ou hospedagem.
 *
 * Com a `sessao` já verificada (rotas e actions), usa o mesmo cliente e não
 * repete o `getClaims`.
 */
export async function loadPreferencesSafe(sessao?: { supabase: SupabaseClient; userId: string }): Promise<DuoPreferences> {
  try {
    const memory = sessao
      ? await readDuoMemory(sessao.supabase, sessao.userId, 0)
      : await loadDuoMemory({ historyLimit: 0 });
    if (memory.error) console.error("[memória] leitura parcial:", memory.error);
    return memory.preferences;
  } catch (error) {
    console.error("[memória] falha ao carregar preferências:", error);
    return {};
  }
}
