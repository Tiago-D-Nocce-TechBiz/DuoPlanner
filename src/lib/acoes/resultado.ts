/**
 * Resultado padronizado das Server Actions (compartilhado com o navegador).
 *
 *   { success: true, data }                 deu certo
 *   { success: false, error, code }         `error` é a mensagem em PT-BR que
 *                                           a tela mostra; `code` decide o
 *                                           comportamento (tentar de novo,
 *                                           pedir login...)
 *
 * Nenhuma action devolve stack trace nem mensagem interna: o que não é falha
 * prevista vira ERRO_INTERNO com uma referência que casa com o log do servidor
 * (`./com-sessao`).
 */

export const CODIGOS_ERRO = [
  "NAO_AUTENTICADO",
  "NAO_CONFIGURADO",
  "ENTRADA_INVALIDA",
  "COTA_EXCEDIDA",
  "SEM_PERMISSAO",
  "NAO_ENCONTRADO",
  "CONFLITO",
  "INDISPONIVEL",
  "ERRO_INTERNO",
] as const;

export type CodigoErro = (typeof CODIGOS_ERRO)[number];

export type Sucesso<T> = { success: true; data: T };
export type Falha = { success: false; error: string; code: CodigoErro };
export type ResultadoAcao<T> = Sucesso<T> | Falha;

export function sucesso<T>(data: T): Sucesso<T> {
  return { success: true, data };
}

export function falha(code: CodigoErro, error: string): Falha {
  return { success: false, code, error };
}

/** Vale tentar de novo sozinho, mais tarde (banco fora, falha inesperada). */
export function falhaTransitoria(r: Falha): boolean {
  return r.code === "INDISPONIVEL" || r.code === "ERRO_INTERNO";
}
