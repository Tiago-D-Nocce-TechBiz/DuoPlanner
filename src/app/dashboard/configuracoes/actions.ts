"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ErroAcao, withAuthFormAction } from "@/lib/acoes/com-sessao";
import { runMemoryAgent } from "@/lib/ai/memory-agent";
import { AiNotConfiguredError } from "@/lib/ai/model";
import { integracaoAtiva } from "@/lib/env";
import { PREFERENCE_KEYS, PREFERENCE_LABELS } from "@/lib/memory/preferences";
import { appendMemoryEntry, deletePreferences } from "@/lib/memory/store";
import { consumirCota } from "@/lib/seguranca/cotas";

/**
 * Agente de Contexto e Memória — ações da tela de Configurações.
 * - ensinarPreferenciasAction: texto livre → preferências tipadas (via IA).
 * - esquecerPreferenciaAction: remove uma preferência memorizada.
 *
 * Ambas exigem sessão (getClaims) pelo envoltório. Antes, sem sessão, a
 * memória era gravada com user_id nulo.
 */

const esquemaEnsinar = z.object({
  mensagem: z
    .string({ error: "Escreva o que a IA deve lembrar sobre a dupla." })
    .trim()
    .min(3, "Escreva o que a IA deve lembrar sobre a dupla.")
    .max(600, "Use no máximo 600 caracteres."),
});

export const ensinarPreferenciasAction = withAuthFormAction(
  "ensinarPreferencias",
  esquemaEnsinar,
  async ({ mensagem }, { sessao }): Promise<{ resposta: string }> => {
    if (!integracaoAtiva("ia")) throw new ErroAcao("NAO_CONFIGURADO", new AiNotConfiguredError().message);
    const { supabase, userId } = sessao;

    const cota = await consumirCota(supabase, userId, "ia");
    if (!cota.permitido) throw new ErroAcao("COTA_EXCEDIDA", cota.mensagem);

    let state: Awaited<ReturnType<typeof runMemoryAgent>>;
    try {
      state = await runMemoryAgent(mensagem, { supabase, userId });
    } catch (error) {
      console.error("[ensinarPreferencias]", error);
      throw new ErroAcao("INDISPONIVEL", "A IA não conseguiu registrar agora. Tente novamente em instantes.");
    }
    if (state.erro) throw new ErroAcao("INDISPONIVEL", state.erro);

    refresh();
    return { resposta: state.resposta || "Anotado!" };
  }
);

const esquemaEsquecer = z.object({
  chave: z.enum(PREFERENCE_KEYS, { error: "Preferência desconhecida." }),
});

export const esquecerPreferenciaAction = withAuthFormAction(
  "esquecerPreferencia",
  esquemaEsquecer,
  async ({ chave }, { sessao }): Promise<null> => {
    const { supabase, userId } = sessao;
    const { error } = await deletePreferences(supabase, userId, [chave]);
    if (error) {
      console.error("[esquecerPreferencia]", error);
      throw new ErroAcao("INDISPONIVEL", "Não foi possível esquecer agora. Tente de novo.");
    }
    await appendMemoryEntry(supabase, userId, {
      tipo: "preferencia",
      resumo: `A dupla pediu para esquecer: ${PREFERENCE_LABELS[chave]}`,
      dados: { esquecidas: [chave] },
    });
    refresh();
    return null;
  }
);
