import "server-only";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  PREFERENCE_KEYS,
  describePreferences,
  parsePreference,
  type DuoPreferences,
  type PreferenceKey,
} from "@/lib/memory/preferences";
import {
  appendMemoryEntry,
  deletePreferences,
  readDuoMemory,
  upsertPreferences,
} from "@/lib/memory/store";
import { AI_TIMEOUT_MS, createGeminiModel } from "./model";

/**
 * Agente de Contexto e Memória — LangGraph + Gemini.
 *
 *   START → carregar (preferências atuais + histórico recente no Supabase)
 *         → interpretar (Gemini extrai SÓ o que a mensagem diz, em chaves tipadas)
 *         → consolidar (valida cada valor e calcula o que mudou)
 *         → salvar (upsert em `preferencias_duo` + entrada em `memoria_ia`)
 *         → END
 *
 * As preferências salvas alimentam os motores de busca (escalas, orçamento,
 * nota mínima) e o agente de Experiências Ocultas (orçamento diário,
 * interesses, restrições).
 */

const extractionSchema = z.object({
  orcamento_voo_max: z
    .number()
    .min(1)
    .optional()
    .describe("Teto em R$ para as passagens da dupla, ida e volta somadas"),
  orcamento_hospedagem_max: z
    .number()
    .min(1)
    .optional()
    .describe("Teto em R$ para a hospedagem inteira (todas as noites, para a dupla)"),
  orcamento_diario_atividades: z
    .number()
    .min(0)
    .optional()
    .describe("Gasto diário desejado com passeios, em R$ (0 = só atividades gratuitas)"),
  max_escalas: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .describe("Máximo de escalas por trecho; 0 = só voos diretos"),
  max_duracao_escala_horas: z
    .number()
    .min(1)
    .max(48)
    .optional()
    .describe(
      "Duração máxima aceitável de cada escala, em horas. Para 'sem escalas longas' sem número, use 4"
    ),
  nota_minima_hospedagem: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("Nota mínima (0 a 10) aceitável para hospedagens"),
  interesses: z
    .array(z.string())
    .optional()
    .describe("Lista COMPLETA de interesses (atuais + novos), só se a mensagem falar de interesses"),
  restricoes: z
    .array(z.string())
    .optional()
    .describe("Lista COMPLETA de restrições ou aversões (atuais + novas), só se a mensagem citar alguma"),
  esquecer: z
    .array(z.enum(PREFERENCE_KEYS))
    .describe("Chaves que a dupla pediu explicitamente para esquecer"),
  resposta: z
    .string()
    .describe("Confirmação curta e calorosa em PT-BR do que foi memorizado ou esquecido (até 2 frases)"),
});

const MemoryState = new StateSchema({
  mensagem: z.string(),
  atuais: z.record(z.string(), z.unknown()).default(() => ({})),
  historico: z.array(z.string()).default(() => []),
  extraido: extractionSchema.nullable().default(null),
  atualizacoes: z.record(z.string(), z.unknown()).default(() => ({})),
  esquecidas: z.array(z.string()).default(() => []),
  resposta: z.string().default(""),
  erro: z.string().nullable().default(null),
});

type State = typeof MemoryState.State;

const SYSTEM_PROMPT = `Você é a memória do PlannerDuo, um planejador de viagens para uma dupla.
Sua tarefa: ler a mensagem da dupla e registrar preferências de viagem em campos tipados.
Regras:
- Preencha apenas campos que a mensagem afirma ou altera. Omita todo o resto.
- Valores em dinheiro são números em reais (ex.: "até 3 mil" → 3000).
- "voo direto"/"sem escalas" → max_escalas = 0.
- Para interesses e restrições, devolva a lista completa já atualizada, sem duplicatas.
- Se pedirem para esquecer algo, use "esquecer" com as chaves correspondentes.
- Se a mensagem não trouxer preferências, devolva só "esquecer": [] e uma resposta explicando o que você consegue memorizar.`;

interface MemoryDeps {
  supabase: SupabaseClient;
  userId: string | null;
}

function buildMemoryGraph(deps: MemoryDeps) {
  async function carregar() {
    const memory = await readDuoMemory(deps.supabase, deps.userId, 5);
    if (memory.error) {
      return {
        erro: `Não consegui ler a memória no Supabase (${memory.error}). Rode supabase/schema.sql.`,
      };
    }
    return {
      atuais: memory.preferences as Record<string, unknown>,
      historico: memory.history
        .filter((h) => h.tipo === "preferencia")
        .map((h) => h.resumo),
    };
  }

  async function interpretar(state: State) {
    const model = createGeminiModel({ reasoningEffort: "low" }).withStructuredOutput(
      extractionSchema,
      { method: "jsonSchema", name: "preferencias" }
    );
    const atuais = describePreferences(state.atuais as DuoPreferences);
    const extraido = await model.invoke(
      [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(
          [
            `Preferências já memorizadas (JSON): ${JSON.stringify(state.atuais)}`,
            atuais.length ? `Em palavras: ${atuais.join("; ")}` : "Ainda não há preferências.",
            state.historico.length
              ? `Mensagens anteriores da dupla: ${state.historico.join(" | ")}`
              : "",
            `Nova mensagem da dupla: """${state.mensagem}"""`,
          ]
            .filter(Boolean)
            .join("\n")
        ),
      ],
      { timeout: AI_TIMEOUT_MS }
    );
    return { extraido, resposta: extraido.resposta.trim() };
  }

  function consolidar(state: State) {
    const x = state.extraido;
    if (!x) return {};
    const atualizacoes: Record<string, unknown> = {};

    for (const key of PREFERENCE_KEYS) {
      if (x[key] === undefined) continue;
      const parsed = parsePreference(key, x[key]);
      if (!parsed) continue; // valor fora das faixas aceitas: ignorado
      const unchanged =
        JSON.stringify(state.atuais[key]) === JSON.stringify(parsed.value);
      if (!unchanged) atualizacoes[key] = parsed.value;
    }

    const esquecidas = x.esquecer.filter(
      (key) => state.atuais[key] !== undefined && !(key in atualizacoes)
    );
    return { atualizacoes, esquecidas };
  }

  async function salvar(state: State) {
    const updates = upsertPreferences(
      deps.supabase,
      deps.userId,
      state.atualizacoes as DuoPreferences,
      "ia"
    );
    const removals = deletePreferences(
      deps.supabase,
      deps.userId,
      state.esquecidas as PreferenceKey[]
    );
    const [up, del] = await Promise.all([updates, removals]);
    const error = up.error ?? del.error;
    if (error) return { erro: `Não consegui salvar a memória: ${error}` };

    await appendMemoryEntry(deps.supabase, deps.userId, {
      tipo: "preferencia",
      resumo: state.mensagem,
      dados: { atualizacoes: state.atualizacoes, esquecidas: state.esquecidas },
    });
    return {};
  }

  return new StateGraph(MemoryState)
    .addNode("carregar", carregar)
    .addNode("interpretar", interpretar)
    .addNode("consolidar", consolidar)
    .addNode("salvar", salvar)
    .addEdge(START, "carregar")
    .addConditionalEdges("carregar", (s) => (s.erro ? END : "interpretar"), [
      "interpretar",
      END,
    ])
    .addEdge("interpretar", "consolidar")
    .addEdge("consolidar", "salvar")
    .addEdge("salvar", END)
    .compile({ name: "agente-memoria" });
}

export async function runMemoryAgent(
  mensagem: string,
  deps: MemoryDeps
): Promise<State> {
  return buildMemoryGraph(deps).invoke({ mensagem });
}
