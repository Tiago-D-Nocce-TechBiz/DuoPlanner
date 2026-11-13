import "server-only";
import { ChatGoogle } from "@langchain/google";
import { ambiente } from "@/lib/env";
import { LIMITE_EXTERNO_MS } from "@/lib/http/fetch-com-limite";

/**
 * Fábrica do modelo Gemini (via @langchain/google, o pacote LangChain atual
 * para Gemini, que substitui @langchain/google-genai).
 *
 * Decisão de modelo: o pedido citava Gemini 1.5 Flash/Pro, mas a família 1.5
 * foi desligada pelo Google (as chamadas retornam 404). Usamos o Flash estável
 * mais recente, `gemini-3.8-flash` (entrada de imagem/PDF, saída estruturada e
 * "thinking"), trocável por GEMINI_MODEL sem mexer no código.
 *
 * Chave, modelo e endpoint vêm do ambiente validado (@/lib/env). Para saber
 * se a IA está ligada: `integracaoAtiva("ia")`.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("IA indisponível: defina GEMINI_API_KEY (Google AI Studio).");
    this.name = "AiNotConfiguredError";
  }
}

/**
 * `reasoningEffort: "low"` reduz latência e custo nas tarefas de extração.
 * (Nos modelos Gemini 3.x o nível "minimal" não é aceito.)
 */
export function createGeminiModel(options?: {
  reasoningEffort?: "low" | "medium" | "high";
}): ChatGoogle {
  const ia = ambiente().ia;
  if (!ia) throw new AiNotConfiguredError();
  return new ChatGoogle({
    model: ia.modelo || DEFAULT_GEMINI_MODEL,
    apiKey: ia.apiKey,
    reasoningEffort: options?.reasoningEffort ?? "low",
    maxRetries: 1,
    // Opcional: proxy/gateway compatível com a API do Gemini (ex.: rede corporativa).
    ...(ia.baseUrl ? { endpoint: ia.baseUrl } : {}),
  });
}

/**
 * Tempo máximo por chamada ao modelo (ms), o mesmo dos demais serviços
 * externos. Cobre a chamada inteira, retentativa incluída: a LangChain
 * transforma o `timeout` num único AbortSignal para o `invoke`. Nas
 * respostas em fluxo (`stream`), vale por trecho: o prazo recomeça a cada
 * parte que chega.
 */
export const AI_TIMEOUT_MS = LIMITE_EXTERNO_MS;
