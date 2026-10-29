import { z } from "zod";

/**
 * Helpers de validação partilhados pelas rotas de busca (fronteira de
 * confiança: tudo o que vem da query string é validado aqui).
 */

export { daysBetween, todayInSaoPaulo } from "@/lib/dates";

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
  .refine(
    (v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)),
    "Data inválida."
  );

/** "1"/"true" → true, "0"/"false" → false. */
export const boolParam = z
  .enum(["1", "0", "true", "false"])
  .transform((v) => v === "1" || v === "true");

/** Converte a query string em objeto, descartando valores vazios. */
export function searchParamsToObject(
  params: URLSearchParams
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params) {
    const trimmed = value.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

/** Arredonda para 2 casas (valores monetários). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Resultado de chamadas a APIs externas, sem lançar exceções. */
export type UpstreamResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/** Extrai uma mensagem legível de um corpo de erro JSON desconhecido. */
export function upstreamMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["message", "error", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}
