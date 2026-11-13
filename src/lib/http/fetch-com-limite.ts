/**
 * `fetch` com tempo máximo, para toda chamada a serviço externo (Kiwi,
 * Booking/RapidAPI, AwesomeAPI, Resend) e para as chamadas do navegador às
 * rotas do app. Puro: roda no servidor e no navegador.
 *
 * O limite cobre a requisição inteira, inclusive a leitura do corpo: o
 * `res.json()` depois do prazo também é interrompido. Ao estourar, rejeita
 * com o mesmo erro do `AbortSignal.timeout` (`name === "TimeoutError"`), que
 * os chamadores já traduzem para uma mensagem em PT-BR (`tempoEsgotado`).
 * Cancelamento do chamador (`signal`) continua valendo junto com o prazo.
 */

/** Limite padrão para serviços externos: nenhuma requisição fica pendurada. */
export const LIMITE_EXTERNO_MS = 8_000;

export type OpcoesFetchComLimite = RequestInit & {
  /** Tempo máximo em ms (padrão: `LIMITE_EXTERNO_MS`). */
  timeoutMs?: number;
};

/** Junta o cancelamento do chamador ao prazo (sem `AbortSignal.any`, que só existe no Safari 17.4+). */
function combinar(chamador: AbortSignal, prazo: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([chamador, prazo]);
  const controle = new AbortController();
  const abortar = (origem: AbortSignal) => () => controle.abort(origem.reason);
  if (chamador.aborted) controle.abort(chamador.reason);
  else if (prazo.aborted) controle.abort(prazo.reason);
  else {
    chamador.addEventListener("abort", abortar(chamador), { once: true });
    prazo.addEventListener("abort", abortar(prazo), { once: true });
  }
  return controle.signal;
}

export function fetchWithTimeout(
  entrada: RequestInfo | URL,
  opcoes: OpcoesFetchComLimite = {},
  fazerFetch: typeof fetch = fetch
): Promise<Response> {
  const { timeoutMs = LIMITE_EXTERNO_MS, signal, ...init } = opcoes;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError(`timeoutMs inválido: ${timeoutMs}`);
  const prazo = AbortSignal.timeout(timeoutMs);
  return fazerFetch(entrada, { ...init, signal: signal ? combinar(signal, prazo) : prazo });
}

/** O erro veio do prazo (e não de rede caída ou cancelamento do chamador)? */
export function tempoEsgotado(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && (erro as { name?: unknown }).name === "TimeoutError";
}

/** `fetch` com prazo fixo, para injetar em clientes que aceitam um `fetch` (ex.: supabase-js). */
export function fetchComPrazo(timeoutMs: number, fazerFetch: typeof fetch = fetch): typeof fetch {
  return (entrada, init) => fetchWithTimeout(entrada, { ...init, timeoutMs }, fazerFetch);
}
