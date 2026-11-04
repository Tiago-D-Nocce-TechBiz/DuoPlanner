/**
 * Documento como a tela o vê (puro): o número NUNCA vem junto — só os 4
 * últimos caracteres e se existe um número completo guardado (cifrado).
 */

export const TIPOS_DOCUMENTO = [
  "Passaporte",
  "RG / CNH",
  "Seguro viagem",
  "Voucher de reserva",
  "Bilhete / Passagem",
  "Visto",
  "Vacina / Saúde",
  "Outro",
] as const;

export interface DocumentoVisivel {
  id: string;
  userId: string;
  tipo: string;
  titular: string;
  numeroFinal: string | null;
  temNumeroCompleto: boolean;
  validade: string | null;
  observacao: string;
  escopo: "viagem_compartilhado" | "pessoal_privado";
  atualizadoEm: string;
}

export function documentoDaLinha(l: Record<string, unknown>): DocumentoVisivel {
  return {
    id: String(l.id ?? ""),
    userId: String(l.user_id ?? ""),
    tipo: typeof l.tipo === "string" ? l.tipo : "Outro",
    titular: typeof l.titular === "string" ? l.titular : "",
    numeroFinal: typeof l.numero_final === "string" && l.numero_final ? l.numero_final : null,
    temNumeroCompleto: typeof l.numero_cifrado === "string" && l.numero_cifrado.length > 0,
    validade: typeof l.validade === "string" ? l.validade.slice(0, 10) : null,
    observacao: typeof l.observacao === "string" ? l.observacao : "",
    escopo: l.escopo === "viagem_compartilhado" ? "viagem_compartilhado" : "pessoal_privado",
    atualizadoEm: typeof l.atualizado_em === "string" ? l.atualizado_em : "",
  };
}

/** Os 4 últimos caracteres alfanuméricos (exibidos como "•••• 1234"). */
export function finalDoNumero(numero: string): string | null {
  const limpo = numero.replace(/[^0-9A-Za-z]/g, "");
  return limpo ? limpo.slice(-4).toUpperCase() : null;
}

export function mascararNumero(final: string | null): string {
  return final ? `•••• ${final}` : "—";
}

/** Documento vencido ou vencendo em até 90 dias (avisos de passaporte). */
export function alertaValidade(validade: string | null, hoje: string): "vencido" | "vence_em_breve" | null {
  if (!validade) return null;
  if (validade < hoje) return "vencido";
  const dias = (Date.parse(`${validade}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000;
  return dias <= 90 ? "vence_em_breve" : null;
}
