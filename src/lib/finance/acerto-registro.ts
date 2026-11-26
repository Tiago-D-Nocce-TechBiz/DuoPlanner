import { uuidDeterministico } from "@/lib/id-deterministico";

/**
 * Registro do pagamento de um Acerto de Contas, sem duplicar.
 *
 * "Já paguei" (quem deve) e "Recebi" (quem recebe) registram o MESMO fato. Se
 * cada um criasse o lançamento com um id sorteado, os dois registros somariam
 * e o saldo inverteria: o credor passaria a dever o valor pago a mais. Aqui o
 * id sai do que identifica o pagamento, então os dois aparelhos chegam ao
 * mesmo registro e a chave primária de `despesas_viagem` deduplica (a segunda
 * criação cai em `23505` e vale como a mesma).
 *
 * O id depende de: espaço, quem paga, quem recebe, o valor em centavos e
 * quantos acertos o casal já registrou. Um novo acerto (depois de novos
 * gastos) tem outro número, logo outro id.
 *
 * Limite conhecido: se os dois aparelhos tiverem dados diferentes (um já
 * recebeu um gasto novo e o outro não), os valores diferem e os registros
 * também. Isso só acontece com a sincronização atrasada e some quando ela
 * termina: o saldo recalculado mostra a diferença para o casal conferir.
 */
export interface PagamentoDeAcerto {
  workspaceId: string;
  /** Quem paga (user id). */
  devedorId: string;
  /** Quem recebe (user id). */
  credorId: string;
  /** Valor do acerto, em centavos inteiros. */
  valorCentavos: number;
  /** Quantos acertos já estão registrados no espaço. */
  acertosJaRegistrados: number;
}

function identidade(p: PagamentoDeAcerto): string {
  if (!Number.isSafeInteger(p.valorCentavos) || p.valorCentavos <= 0) throw new RangeError(`Valor de acerto inválido: ${p.valorCentavos}.`);
  if (!Number.isSafeInteger(p.acertosJaRegistrados) || p.acertosJaRegistrados < 0) throw new RangeError("Número de acertos inválido.");
  return ["acerto", p.workspaceId, p.devedorId, p.credorId, String(p.valorCentavos), String(p.acertosJaRegistrados)].join("|");
}

/** Id do lançamento `tipo = acerto`: igual para quem paga e para quem recebe. */
export function idDoAcerto(p: PagamentoDeAcerto): string {
  return uuidDeterministico(identidade(p));
}

/**
 * Identificador do Pix deste acerto (campo 62.05 do BR Code): 25 caracteres
 * alfanuméricos, estáveis para o mesmo acerto e diferentes entre acertos.
 * Quem concilia o extrato acha o pagamento pelo txid.
 */
export function txidDoAcerto(p: PagamentoDeAcerto): string {
  return `DP${uuidDeterministico(`txid|${identidade(p)}`).replace(/-/g, "").slice(0, 23).toUpperCase()}`;
}

/** Quantos pagamentos de acerto compartilhados o espaço já registrou. */
export function contarAcertos(despesas: readonly { tipo: string; escopo: string }[]): number {
  return despesas.reduce((n, d) => (d.tipo === "acerto" && d.escopo === "viagem_compartilhado" ? n + 1 : n), 0);
}
