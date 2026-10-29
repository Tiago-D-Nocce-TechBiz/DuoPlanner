/**
 * Utilitários partilhados do PlannerDuo.
 */

/**
 * Concatena classes condicionais de forma segura (substituto leve de clsx/cn).
 * Aceita strings, falsy (ignorados) e remove espaços duplicados.
 */
export function cn(
  ...inputs: Array<string | false | null | undefined>
): string {
  return inputs.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Formata uma data ISO (yyyy-mm-dd) para dd/mm/aaaa. Devolve "" se vazia. */
export function formatDateBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/**
 * Formata um valor como moeda (pt-BR). Padrão: Real. Códigos ISO inválidos
 * (ex.: vindos de um recibo mal lido) caem num formato simples em vez de lançar.
 */
export function formatCurrency(value: number, currency = "BRL"): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Duração em minutos para "2h 05min" / "45min" / "3h". */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

/**
 * Lê "HH:MM" e "dd/mm" de um horário LOCAL em ISO. A Kiwi devolve horários
 * locais com sufixo "Z" que não são UTC, então não convertemos fuso: apenas
 * recortamos a string.
 */
export function splitLocalDateTime(isoLocal: string): {
  time: string;
  day: string;
} {
  const date = isoLocal.slice(0, 10);
  const [, m, d] = date.split("-");
  return { time: isoLocal.slice(11, 16), day: d && m ? `${d}/${m}` : date };
}
