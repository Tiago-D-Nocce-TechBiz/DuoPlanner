/**
 * Utilitários partilhados do DuoPlanner.
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
 * Um `Intl.NumberFormat` de moeda (pt-BR) por código, criado uma vez e
 * reaproveitado: construir um custa bem mais que formatar, e as listas
 * (gastos, hospedagens, voos) formatam em cada linha a cada render.
 * `null` = código que o Intl recusa. Teto de 64 códigos (vêm dos dados).
 */
const formatadoresDeMoeda = new Map<string, Intl.NumberFormat | null>();

export function formatadorDeMoeda(codigo: string): Intl.NumberFormat | null {
  let formatador = formatadoresDeMoeda.get(codigo);
  if (formatador === undefined) {
    try {
      formatador = new Intl.NumberFormat("pt-BR", { style: "currency", currency: codigo });
    } catch {
      formatador = null;
    }
    if (formatadoresDeMoeda.size >= 64) formatadoresDeMoeda.clear();
    formatadoresDeMoeda.set(codigo, formatador);
  }
  return formatador;
}

/**
 * Formata um valor como moeda (pt-BR). Padrão: Real. Códigos ISO inválidos
 * (ex.: vindos de um recibo mal lido) caem num formato simples em vez de lançar.
 */
export function formatCurrency(value: number, currency = "BRL"): string {
  const formatador = formatadorDeMoeda(currency);
  return formatador ? formatador.format(value) : `${currency} ${value.toFixed(2)}`;
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
