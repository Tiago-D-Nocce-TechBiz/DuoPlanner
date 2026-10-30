import "server-only";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { cacheLife } from "next/cache";
import { z } from "zod";
import {
  describePreference,
  type DuoPreferences,
} from "@/lib/memory/preferences";
import {
  AI_TIMEOUT_MS,
  AiNotConfiguredError,
  createGeminiModel,
} from "./model";

/**
 * Agente de Experiências Ocultas (Local Gems) — etapa do planejamento que
 * roda depois de uma busca de voo ou hospedagem e sugere 3 atividades
 * gratuitas ou de baixo custo no destino escolhido.
 *
 *   START → contexto (preferências da memória relevantes para passeios)
 *         → sugerir (Gemini, saída estruturada com exatamente 3 itens)
 *         → END
 *
 * A geração tem cache de servidor por destino + mês + contexto: a mesma
 * dupla buscando o mesmo destino várias vezes não paga outra chamada à IA.
 */

export const localGemSchema = z.object({
  nome: z.string().describe("Nome do lugar ou da experiência"),
  descricao: z.string().describe("O que fazer ali, em 1 ou 2 frases"),
  custo: z.enum(["gratuito", "baixo custo"]),
  custo_estimado: z
    .string()
    .describe("Ex.: 'Grátis' ou 'R$ 20–40 por pessoa' (converta moeda local para R$ aproximado)"),
  melhor_momento: z.string().describe("Melhor dia, horário ou época para ir"),
  dica_local: z.string().describe("Dica de quem conhece: como chegar, o que levar ou o que evitar"),
});

export type LocalGem = z.infer<typeof localGemSchema>;

const gemsOutputSchema = z.object({
  experiencias: z.array(localGemSchema).min(3).max(3),
});

const SYSTEM_PROMPT = `Você é o curador de "Experiências Ocultas" do DuoPlanner, um app de viagens a dois.
Sugira exatamente 3 atividades GRATUITAS ou de BAIXO CUSTO no destino informado, fugindo do roteiro de cartão-postal.
Priorize lugares reais e consolidados, fáceis de verificar: mirantes, feiras, bairros, trilhas urbanas, museus com dia de entrada gratuita, eventos recorrentes.
Não cite lugares de cuja existência você não tenha certeza. Adapte as sugestões ao mês da viagem e ao contexto da dupla.
Escreva em português do Brasil, com tom de amigo local.`;

type GemsResult =
  | { ok: true; experiencias: LocalGem[] }
  | { ok: false; message: string };

/** Chamada ao Gemini com cache (sucesso: dias; erro: segundos). */
async function generateLocalGems(input: {
  destino: string;
  mes: string | null;
  contexto: string[];
}): Promise<GemsResult> {
  "use cache";

  try {
    const model = createGeminiModel({ reasoningEffort: "medium" }).withStructuredOutput(
      gemsOutputSchema,
      { method: "jsonSchema", name: "experiencias_ocultas" }
    );
    const output = await model.invoke(
      [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(
          [
            `Destino: ${input.destino}`,
            `Mês da viagem: ${input.mes ?? "não informado"}`,
            input.contexto.length
              ? `Contexto da dupla:\n- ${input.contexto.join("\n- ")}`
              : "Contexto da dupla: sem preferências registradas.",
          ].join("\n")
        ),
      ],
      { timeout: AI_TIMEOUT_MS }
    );

    const experiencias = output.experiencias.slice(0, 3);
    if (experiencias.length < 3) {
      cacheLife("seconds");
      return { ok: false, message: "A IA devolveu menos de 3 sugestões. Tente novamente." };
    }
    cacheLife("days");
    return { ok: true, experiencias };
  } catch (error) {
    cacheLife("seconds");
    if (error instanceof AiNotConfiguredError) return { ok: false, message: error.message };
    console.error("[experiências] falha na IA:", error);
    return { ok: false, message: "A IA não conseguiu sugerir experiências agora." };
  }
}

const GemsState = new StateSchema({
  destino: z.string(),
  mes: z.string().nullable().default(null),
  preferencias: z.record(z.string(), z.unknown()).default(() => ({})),
  contexto: z.array(z.string()).default(() => []),
  experiencias: z.array(localGemSchema).default(() => []),
  erro: z.string().nullable().default(null),
});

type State = typeof GemsState.State;

/** Só o que importa para passeios entra no prompt (e na chave do cache). */
function contexto(state: State) {
  const prefs = state.preferencias as DuoPreferences;
  const linhas: string[] = [];
  if (prefs.orcamento_diario_atividades !== undefined) {
    linhas.push(describePreference("orcamento_diario_atividades", prefs.orcamento_diario_atividades));
  }
  if (prefs.interesses?.length) linhas.push(describePreference("interesses", prefs.interesses));
  if (prefs.restricoes?.length) linhas.push(describePreference("restricoes", prefs.restricoes));
  return { contexto: linhas };
}

async function sugerir(state: State) {
  const result = await generateLocalGems({
    destino: state.destino,
    mes: state.mes,
    contexto: state.contexto,
  });
  return result.ok ? { experiencias: result.experiencias } : { erro: result.message };
}

const localGemsGraph = new StateGraph(GemsState)
  .addNode("contexto", contexto)
  .addNode("sugerir", sugerir)
  .addEdge(START, "contexto")
  .addEdge("contexto", "sugerir")
  .addEdge("sugerir", END)
  .compile({ name: "agente-experiencias-ocultas" });

export async function runLocalGemsAgent(input: {
  destino: string;
  mes: string | null;
  preferencias: DuoPreferences;
}): Promise<State> {
  return localGemsGraph.invoke(input);
}
