/**
 * Regras puras das cotas de uso por usuário (testáveis, sem I/O).
 *
 * As chamadas pagas (Kiwi, RapidAPI, Gemini) e o envio de e-mails ficam
 * atrás de uma janela fixa por `user_id`. A contagem oficial mora no Postgres
 * (RPC `consumir_cota`, compartilhada entre as instâncias serverless); estas
 * funções definem os limites e servem ao limitador em memória usado só
 * enquanto a migration não foi aplicada.
 */

export const LIMITES_COTA = {
  voos: { limite: 30, janelaSegundos: 3600, rotulo: "buscas de voos por hora" },
  hospedagem: { limite: 30, janelaSegundos: 3600, rotulo: "buscas de hospedagem por hora" },
  ia: { limite: 20, janelaSegundos: 3600, rotulo: "pedidos à IA por hora" },
  convite: { limite: 10, janelaSegundos: 86_400, rotulo: "convites por dia" },
  documento: { limite: 30, janelaSegundos: 3600, rotulo: "consultas de documentos por hora" },
} as const;

export type RecursoCota = keyof typeof LIMITES_COTA;

export const RECURSOS_COTA = Object.keys(LIMITES_COTA) as RecursoCota[];

/** Início (ms) da janela fixa que contém `agoraMs`. Mesma conta do SQL. */
export function inicioDaJanela(agoraMs: number, janelaSegundos: number): number {
  const janelaMs = janelaSegundos * 1000;
  return Math.floor(agoraMs / janelaMs) * janelaMs;
}

export interface EstadoJanela {
  inicioMs: number;
  contador: number;
}

/** Registra mais um uso: nova janela zera o contador. Devolve o novo estado. */
export function registrarUso(
  estado: EstadoJanela | undefined,
  agoraMs: number,
  janelaSegundos: number
): EstadoJanela {
  const inicioMs = inicioDaJanela(agoraMs, janelaSegundos);
  if (!estado || estado.inicioMs !== inicioMs) return { inicioMs, contador: 1 };
  return { inicioMs, contador: estado.contador + 1 };
}

/** Mensagem em PT-BR com o horário (Brasília) em que a cota volta. */
export function mensagemCotaExcedida(recurso: RecursoCota, reiniciaEm: Date): string {
  const { limite, rotulo } = LIMITES_COTA[recurso];
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(reiniciaEm);
  return `Você atingiu o limite de ${limite} ${rotulo}. Tente de novo a partir das ${hora}.`;
}

/** Segundos até `reiniciaEm` (cabeçalho Retry-After), no mínimo 1. */
export function segundosAte(reiniciaEm: Date, agoraMs = Date.now()): number {
  return Math.max(1, Math.ceil((reiniciaEm.getTime() - agoraMs) / 1000));
}
