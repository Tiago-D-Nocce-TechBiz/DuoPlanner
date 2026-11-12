"use server";

import { z } from "zod";
import { ErroAcao, withAuthAction } from "@/lib/acoes/com-sessao";
import { runLocalGemsAgent, type LocalGem } from "@/lib/ai/local-gems-agent";
import { AiNotConfiguredError } from "@/lib/ai/model";
import { monthLabel } from "@/lib/dates";
import { integracaoAtiva } from "@/lib/env";
import { loadPreferencesSafe } from "@/lib/memory/store";
import { consumirCota } from "@/lib/seguranca/cotas";
import { isoDateSchema } from "@/lib/travel/params";

/**
 * Etapa "Experiências Ocultas": chamada pelas telas de busca assim que o
 * destino é conhecido. Devolve 3 atividades gratuitas ou de baixo custo.
 *
 * Exige sessão e consome a cota "ia" do usuário: a action é um endpoint
 * público (POST em qualquer rota) e cada chamada custa uma requisição ao
 * Gemini.
 */

export interface ExperienciasLocais {
  destino: string;
  experiencias: LocalGem[];
  contexto: string[];
}

const DESTINO_INVALIDO = "Destino inválido para sugestões.";

const esquemaEntrada = z.object({
  destino: z
    .string({ error: DESTINO_INVALIDO })
    .trim()
    .min(2, DESTINO_INVALIDO)
    .max(80, DESTINO_INVALIDO)
    .regex(/^[\p{L}\p{M}\s'’.,()-]+$/u, DESTINO_INVALIDO),
  /** AAAA-MM-DD; inválida é ignorada (as sugestões saem sem o mês). */
  dataViagem: z.string().nullish(),
});

export const sugerirExperienciasLocais = withAuthAction(
  "sugerirExperienciasLocais",
  esquemaEntrada,
  async ({ destino, dataViagem }, { sessao }): Promise<ExperienciasLocais> => {
    if (!integracaoAtiva("ia")) throw new ErroAcao("NAO_CONFIGURADO", new AiNotConfiguredError().message);

    const cota = await consumirCota(sessao.supabase, sessao.userId, "ia");
    if (!cota.permitido) throw new ErroAcao("COTA_EXCEDIDA", cota.mensagem);

    const mes = dataViagem && isoDateSchema.safeParse(dataViagem).success ? monthLabel(dataViagem) : null;
    let state: Awaited<ReturnType<typeof runLocalGemsAgent>>;
    try {
      const preferencias = await loadPreferencesSafe();
      state = await runLocalGemsAgent({ destino, mes, preferencias });
    } catch (error) {
      console.error("[sugerirExperienciasLocais]", error);
      throw new ErroAcao("INDISPONIVEL", "A IA não conseguiu sugerir experiências agora.");
    }
    if (state.erro || state.experiencias.length === 0) {
      throw new ErroAcao("INDISPONIVEL", state.erro ?? "Sem sugestões para este destino.");
    }
    return { destino, experiencias: state.experiencias, contexto: state.contexto };
  }
);
