"use server";

import { refresh } from "next/cache";
import { runMemoryAgent } from "@/lib/ai/memory-agent";
import { AiNotConfiguredError, isGeminiConfigured } from "@/lib/ai/model";
import { obterSessao } from "@/lib/auth/sessao";
import { PREFERENCE_LABELS, isPreferenceKey } from "@/lib/memory/preferences";
import {
  appendMemoryEntry,
  deletePreferences,
} from "@/lib/memory/store";
import { consumirCota } from "@/lib/seguranca/cotas";

/**
 * Agente de Contexto e Memória — ações da tela de Configurações.
 * - ensinarPreferenciasAction: texto livre → preferências tipadas (via IA).
 * - esquecerPreferenciaAction: remove uma preferência memorizada.
 *
 * Ambas exigem sessão (getClaims) dentro da própria action. Antes, sem
 * sessão, a memória era gravada com user_id nulo.
 */

export interface TeachMemoryState {
  ok: boolean | null;
  message: string;
}

export async function ensinarPreferenciasAction(
  _previous: TeachMemoryState,
  formData: FormData
): Promise<TeachMemoryState> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, message: auth.mensagem };
  const { supabase, userId } = auth.sessao;

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

  const cota = await consumirCota(supabase, userId, "ia");
  if (!cota.permitido) return { ok: false, message: cota.mensagem };

  try {
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
  const auth = await obterSessao();
  if (!auth.ok) return;
  const { supabase, userId } = auth.sessao;

  const chave = formData.get("chave");
  if (!isPreferenceKey(chave)) return;

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
