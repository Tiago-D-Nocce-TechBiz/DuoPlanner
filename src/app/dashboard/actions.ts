"use server";

import { z } from "zod";
import {
  runLocalGemsAgent,
  type LocalGem,
} from "@/lib/ai/local-gems-agent";
import { AiNotConfiguredError, isGeminiConfigured } from "@/lib/ai/model";
import { obterSessao } from "@/lib/auth/sessao";
import { monthLabel } from "@/lib/dates";
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

export type LocalGemsResult =
  | { ok: true; destino: string; experiencias: LocalGem[]; contexto: string[] }
  | { ok: false; destino: string; message: string };

const destinoSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}\p{M}\s'’.,()-]+$/u);

export async function sugerirExperienciasLocais(
  destino: string,
  dataViagem?: string | null
): Promise<LocalGemsResult> {
  const label = typeof destino === "string" ? destino.trim().slice(0, 80) : "";

  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, destino: label, message: auth.mensagem };

  const parsed = destinoSchema.safeParse(destino);
  if (!parsed.success) {
    return { ok: false, destino: label, message: "Destino inválido para sugestões." };
  }
  if (!isGeminiConfigured()) {
    return { ok: false, destino: label, message: new AiNotConfiguredError().message };
  }

  const cota = await consumirCota(auth.sessao.supabase, auth.sessao.userId, "ia");
  if (!cota.permitido) return { ok: false, destino: parsed.data, message: cota.mensagem };

  try {
    const mes =
      dataViagem && isoDateSchema.safeParse(dataViagem).success
        ? monthLabel(dataViagem)
        : null;
    const preferencias = await loadPreferencesSafe();
    const state = await runLocalGemsAgent({ destino: parsed.data, mes, preferencias });

    if (state.erro || state.experiencias.length === 0) {
      return {
        ok: false,
        destino: parsed.data,
        message: state.erro ?? "Sem sugestões para este destino.",
      };
    }
    return {
      ok: true,
      destino: parsed.data,
      experiencias: state.experiencias,
      contexto: state.contexto,
    };
  } catch (error) {
    console.error("[sugerirExperienciasLocais]", error);
    return {
      ok: false,
      destino: parsed.data,
      message: "A IA não conseguiu sugerir experiências agora.",
    };
  }
}
