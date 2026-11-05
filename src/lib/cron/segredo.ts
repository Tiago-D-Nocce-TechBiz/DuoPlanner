import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Autorização das tarefas agendadas (puro, testável).
 *
 * A Vercel chama cada cron com `Authorization: Bearer <CRON_SECRET>`. A
 * comparação é em tempo constante (os dois lados viram SHA-256, de tamanho
 * fixo). Sem segredo configurado, ou com menos de 16 caracteres, a tarefa é
 * recusada (fail-closed): a rota é pública e dispara buscas pagas e e-mails.
 */

export type VerificacaoCron = "ok" | "sem_segredo" | "negado";

export const TAMANHO_MINIMO_SEGREDO = 16;

export function verificarSegredoCron(cabecalho: string | null, segredo: string | undefined): VerificacaoCron {
  if (!segredo || segredo.length < TAMANHO_MINIMO_SEGREDO) return "sem_segredo";
  if (!cabecalho) return "negado";
  const esperado = createHash("sha256").update(`Bearer ${segredo}`).digest();
  const recebido = createHash("sha256").update(cabecalho).digest();
  return timingSafeEqual(esperado, recebido) ? "ok" : "negado";
}
