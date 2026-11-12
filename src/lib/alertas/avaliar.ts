/**
 * Quando avisar por e-mail que um alerta de preço chegou ao alvo (puro).
 *
 * Promessa feita na tela de Alertas: "no máximo um aviso a cada 3 dias,
 * salvo nova queda de 5%". Regras:
 *  1. Sem preço-alvo: só registra o preço, nunca avisa.
 *  2. Acima do alvo: não avisa e "rearma" o alerta (esquece o preço do último
 *     aviso), para que voltar ao alvo depois conte como novidade.
 *  3. No alvo ou abaixo:
 *     - nunca avisado (ou rearmado): avisa, desde que o último aviso tenha
 *       sido há 3 dias ou mais;
 *     - já avisado a P: avisa na hora se caiu 5% ou mais em relação a P; ou,
 *       passados 3 dias, se está abaixo de P. O mesmo preço nunca gera dois
 *       e-mails.
 * Trocar o alvo, as datas ou o destino zera esse histórico no banco (trigger
 * `antes_gravar_alerta`), então o próximo preço no alvo volta a avisar.
 * Valores comparados em centavos inteiros.
 */

import { toCents } from "@/lib/finance/money";

export const DIAS_ENTRE_AVISOS = 3;
export const QUEDA_RELEVANTE = 0.05;

export interface EstadoAvisos {
  precoAlvo: number | null;
  /** Preço informado no último e-mail; null = nunca avisado ou rearmado. */
  ultimoPrecoNotificado: number | null;
  /** Quando foi o último e-mail (ISO); null = nunca. */
  ultimoDisparoEm: string | null;
}

export type DecisaoAviso =
  | {
      notificar: true;
      motivo: "primeiro_aviso" | "voltou_ao_alvo" | "nova_queda" | "abaixo_do_ultimo_aviso";
      /** Preço do aviso anterior, para o e-mail mostrar quanto caiu. */
      precoAnterior: number | null;
    }
  | {
      notificar: false;
      motivo: "sem_alvo" | "acima_do_alvo" | "aguardando_intervalo" | "sem_queda";
      /** true = gravar ultimo_preco_notificado = null. */
      rearmar: boolean;
    };

const centavos = toCents;
const DIA_MS = 86_400_000;

export function decidirAviso(precoAtual: number, estado: EstadoAvisos, agoraMs: number): DecisaoAviso {
  if (estado.precoAlvo === null) return { notificar: false, motivo: "sem_alvo", rearmar: false };

  const atual = centavos(precoAtual);
  if (atual > centavos(estado.precoAlvo)) {
    return { notificar: false, motivo: "acima_do_alvo", rearmar: estado.ultimoPrecoNotificado !== null };
  }

  const disparo = estado.ultimoDisparoEm ? Date.parse(estado.ultimoDisparoEm) : NaN;
  const intervaloCumprido = !Number.isFinite(disparo) || agoraMs - disparo >= DIAS_ENTRE_AVISOS * DIA_MS;

  if (estado.ultimoPrecoNotificado === null) {
    if (!intervaloCumprido) return { notificar: false, motivo: "aguardando_intervalo", rearmar: false };
    return {
      notificar: true,
      motivo: estado.ultimoDisparoEm ? "voltou_ao_alvo" : "primeiro_aviso",
      precoAnterior: null,
    };
  }

  const anterior = centavos(estado.ultimoPrecoNotificado);
  if (atual <= Math.floor(anterior * (1 - QUEDA_RELEVANTE))) {
    return { notificar: true, motivo: "nova_queda", precoAnterior: estado.ultimoPrecoNotificado };
  }
  if (atual < anterior) {
    return intervaloCumprido
      ? { notificar: true, motivo: "abaixo_do_ultimo_aviso", precoAnterior: estado.ultimoPrecoNotificado }
      : { notificar: false, motivo: "aguardando_intervalo", rearmar: false };
  }
  return { notificar: false, motivo: "sem_queda", rearmar: false };
}
