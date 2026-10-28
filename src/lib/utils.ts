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
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Formata um valor numérico como moeda em Reais (pt-BR). */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
