"use server";

import { refresh } from "next/cache";
import { runMemoryAgent } from "@/lib/ai/memory-agent";
import { AiNotConfiguredError, isGeminiConfigured } from "@/lib/ai/model";
import { PREFERENCE_LABELS, isPreferenceKey } from "@/lib/memory/preferences";
import {
  appendMemoryEntry,
  deletePreferences,
} from "@/lib/memory/store";
import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";

/**
 * Agente de Contexto e Memória — ações da tela de Configurações.
 * - ensinarPreferenciasAction: texto livre → preferências tipadas (via IA).
 * - esquecerPreferenciaAction: remove uma preferência memorizada.
 */

export interface TeachMemoryState {
  ok: boolean | null;
  message: string;
}

export async function ensinarPreferenciasAction(
  _previous: TeachMemoryState,
  formData: FormData
): Promise<TeachMemoryState> {
  const mensagem = String(formData.get("mensagem") ?? "").trim();
  if (mensagem.length < 3) {
    return { ok: false, message: "Escreva o que a IA deve lembrar sobre a dupla." };
  }
  if (mensagem.length > 600) {
    return { ok: false, message: "Use no máximo 600 caracteres." };
  }
  if (!isGeminiConfigured()) {
    return { ok: false, message: new AiNotConfiguredError().message };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Configure o Supabase para a IA guardar a memória da dupla.",
    };
  }

  try {
    const userId = await getCurrentUserId(supabase);
    const state = await runMemoryAgent(mensagem, { supabase, userId });
    if (state.erro) return { ok: false, message: state.erro };

    refresh();
    return { ok: true, message: state.resposta || "Anotado!" };
  } catch (error) {
    console.error("[ensinarPreferencias]", error);
    return {
      ok: false,
      message: "A IA não conseguiu registrar agora. Tente novamente em instantes.",
    };
  }
}

export async function esquecerPreferenciaAction(formData: FormData): Promise<void> {
  const chave = formData.get("chave");
  if (!isPreferenceKey(chave)) return;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  const userId = await getCurrentUserId(supabase);
  const { error } = await deletePreferences(supabase, userId, [chave]);
  if (error) {
    console.error("[esquecerPreferencia]", error);
    return;
  }
  await appendMemoryEntry(supabase, userId, {
    tipo: "preferencia",
    resumo: `A dupla pediu para esquecer: ${PREFERENCE_LABELS[chave]}`,
    dados: { esquecidas: [chave] },
  });
  refresh();
}
