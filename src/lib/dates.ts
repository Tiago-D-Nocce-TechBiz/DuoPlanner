/** Datas no calendário do Brasil (o app é usado a partir de São Paulo). */

const DIA_EM_SAO_PAULO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Hoje" no fuso de São Paulo, em AAAA-MM-DD. */
export function todayInSaoPaulo(): string {
  return DIA_EM_SAO_PAULO.format(new Date());
}

/** Dia (AAAA-MM-DD) de um instante no fuso de São Paulo; "" se inválido. */
export function dateInSaoPaulo(instante: string | Date): string {
  const data = typeof instante === "string" ? new Date(instante) : instante;
  return Number.isNaN(data.getTime()) ? "" : DIA_EM_SAO_PAULO.format(data);
}

/** Diferença em dias entre duas datas ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
  );
}

/** Soma dias a uma data ISO (AAAA-MM-DD). */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monta AAAA-MM-DD validando o calendário (31/02 → null). */
export function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** "2026-10-05" → "05/10/2026" (formato exibido no DuoFinance). */
export function isoToBR(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** "2026-12-01" → "dezembro de 2026". */
export function monthLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
}
