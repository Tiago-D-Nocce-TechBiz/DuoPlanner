/**
 * Código (digest) de um erro capturado por um error boundary do App Router.
 *
 * Erros do servidor chegam ao navegador com a mensagem genérica e um
 * `digest` que casa com o log do servidor; é o que a tela mostra ao suporte.
 * Módulo sem dependências: o `global-error` o importa e precisa ser mínimo.
 */
export function codigoDoErro(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest ? digest : null;
}
