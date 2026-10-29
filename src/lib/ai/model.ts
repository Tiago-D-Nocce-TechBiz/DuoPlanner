import "server-only";
import { ChatGoogle } from "@langchain/google";

/**
 * Fábrica do modelo Gemini (via @langchain/google, o pacote LangChain atual
 * para Gemini, que substitui @langchain/google-genai).
 *
 * Decisão de modelo: o pedido citava Gemini 1.5 Flash/Pro, mas a família 1.5
 * foi desligada pelo Google (as chamadas retornam 404). Usamos o Flash estável
 * mais recente, `gemini-3.8-flash` (entrada de imagem/PDF, saída estruturada e
 * "thinking"), trocável por GEMINI_MODEL sem mexer no código.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("IA indisponível: defina GEMINI_API_KEY (Google AI Studio).");
    this.name = "AiNotConfiguredError";
  }
}

function geminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

export function isGeminiConfigured(): boolean {
  return Boolean(geminiApiKey());
}

export function geminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

/**
 * `reasoningEffort: "low"` reduz latência e custo nas tarefas de extração.
 * (Nos modelos Gemini 3.x o nível "minimal" não é aceito.)
 */
export function createGeminiModel(options?: {
  reasoningEffort?: "low" | "medium" | "high";
}): ChatGoogle {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new AiNotConfiguredError();
  // Opcional: proxy/gateway compatível com a API do Gemini (ex.: rede corporativa).
  const endpoint = process.env.GEMINI_API_BASE_URL?.trim() || undefined;
  return new ChatGoogle({
    model: geminiModelName(),
    apiKey,
    reasoningEffort: options?.reasoningEffort ?? "low",
    maxRetries: 1,
    ...(endpoint ? { endpoint } : {}),
  });
}

/** Tempo máximo por chamada ao modelo (ms). */
export const AI_TIMEOUT_MS = 45_000;
