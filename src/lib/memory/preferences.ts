import { z } from "zod";
import { formatCurrency } from "@/lib/utils";

/**
 * Preferências da dupla que a IA memoriza (tabela `preferencias_duo`).
 *
 * Decisão: um conjunto FECHADO de chaves tipadas em vez de texto livre. Assim
 * os motores de busca aplicam as preferências de forma determinística (ex.:
 * `max_escalas` vira filtro da Kiwi) e a IA só preenche campos conhecidos.
 * Este módulo é puro (sem acesso a banco) e pode ser usado no cliente.
 */

export const PREFERENCE_KEYS = [
  "orcamento_voo_max",
  "orcamento_hospedagem_max",
  "orcamento_diario_atividades",
  "max_escalas",
  "max_duracao_escala_horas",
  "nota_minima_hospedagem",
  "interesses",
  "restricoes",
] as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

/** Nome curto de cada preferência (UI e histórico). */
export const PREFERENCE_LABELS: Record<PreferenceKey, string> = {
  orcamento_voo_max: "orçamento das passagens",
  orcamento_hospedagem_max: "orçamento da hospedagem",
  orcamento_diario_atividades: "orçamento diário de passeios",
  max_escalas: "limite de escalas",
  max_duracao_escala_horas: "duração máxima das escalas",
  nota_minima_hospedagem: "nota mínima das hospedagens",
  interesses: "interesses",
  restricoes: "restrições",
};

/** Validação de cada valor (dados vindos do banco e da IA são não confiáveis). */
export const preferenceValueSchemas = {
  orcamento_voo_max: z.number().min(1).max(1_000_000),
  orcamento_hospedagem_max: z.number().min(1).max(1_000_000),
  orcamento_diario_atividades: z.number().min(0).max(100_000),
  max_escalas: z.number().int().min(0).max(3),
  max_duracao_escala_horas: z.number().min(1).max(48),
  nota_minima_hospedagem: z.number().min(0).max(10),
  interesses: z.array(z.string().trim().min(1).max(60)).max(12),
  restricoes: z.array(z.string().trim().min(1).max(80)).max(12),
} satisfies Record<PreferenceKey, z.ZodType>;

export type DuoPreferences = {
  [K in PreferenceKey]?: z.infer<(typeof preferenceValueSchemas)[K]>;
};

export function isPreferenceKey(value: unknown): value is PreferenceKey {
  return (
    typeof value === "string" &&
    (PREFERENCE_KEYS as readonly string[]).includes(value)
  );
}

/** Valida um par chave/valor; devolve null se a chave ou o valor forem inválidos. */
export function parsePreference(
  key: unknown,
  value: unknown
): { key: PreferenceKey; value: unknown } | null {
  if (!isPreferenceKey(key)) return null;
  const parsed = preferenceValueSchemas[key].safeParse(value);
  return parsed.success ? { key, value: parsed.data } : null;
}

/** Frase curta em PT-BR para UI e para o contexto dos prompts. */
export function describePreference(key: PreferenceKey, value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  const list = Array.isArray(value) ? value.join(", ") : String(value);

  switch (key) {
    case "orcamento_voo_max":
      return `Passagens da dupla até ${formatCurrency(n)} (ida e volta)`;
    case "orcamento_hospedagem_max":
      return `Hospedagem até ${formatCurrency(n)} no total da estadia`;
    case "orcamento_diario_atividades":
      return n === 0
        ? "Passeios só gratuitos"
        : `Passeios até ${formatCurrency(n)} por dia`;
    case "max_escalas":
      return n === 0
        ? "Somente voos diretos"
        : `No máximo ${n} ${n === 1 ? "escala" : "escalas"} por trecho`;
    case "max_duracao_escala_horas":
      return `Escalas de no máximo ${n}h`;
    case "nota_minima_hospedagem":
      return `Hospedagens com nota a partir de ${n.toLocaleString("pt-BR")}`;
    case "interesses":
      return `Interesses: ${list}`;
    case "restricoes":
      return `Evitar: ${list}`;
  }
}

/** Lista de frases, na ordem canônica das chaves. */
export function describePreferences(prefs: DuoPreferences): string[] {
  return PREFERENCE_KEYS.filter((k) => prefs[k] !== undefined).map((k) =>
    describePreference(k, prefs[k])
  );
}
