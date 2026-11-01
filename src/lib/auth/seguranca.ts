/**
 * Regras puras de segurança do fluxo de login e convite (testáveis, sem I/O).
 */

/** URL pública do app (links de convite e retorno da confirmação de e-mail). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://duoplanner-vert.vercel.app").replace(/\/$/, "");

const DESTINO_PADRAO = "/dashboard";

/**
 * Destino depois do login. Só aceita caminhos internos do painel
 * ("/dashboard/financas"); qualquer outra coisa ("//site.com",
 * "https://...", "/\\site.com", "/login") volta para o painel. Evita open
 * redirect.
 */
export function destinoSeguro(bruto: string | null | undefined): string {
  const destino = (bruto ?? "").trim();
  return /^\/dashboard(?:\/[A-Za-z0-9_-]+)*\/?$/.test(destino) ? destino : DESTINO_PADRAO;
}

/**
 * Formato de código de convite: letras, dígitos e hífen, 4 a 64 caracteres.
 * O banco gera 16 caracteres hexadecimais; códigos com outro formato nem
 * chegam a ser consultados.
 */
export function codigoConviteValido(bruto: string | null | undefined): string | null {
  const codigo = (bruto ?? "").trim();
  return /^[A-Za-z0-9-]{4,64}$/.test(codigo) ? codigo : null;
}

/**
 * Destino depois de confirmar o e-mail: o convite pendente (quando há) ou o
 * painel. Usado para montar e validar o `next` de /auth/callback.
 */
export function destinoPosConfirmacao(next: string | null | undefined): string {
  const bruto = (next ?? "").trim();
  const convite = /^\/convite\?code=([A-Za-z0-9-]{4,64})$/.exec(bruto);
  if (convite) return `/convite?code=${convite[1]}`;
  return destinoSeguro(bruto);
}

/** O erro do PostgREST indica função RPC inexistente (SQL ainda não aplicado). */
export function funcaoRpcAusente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return erro.code === "PGRST202" || /could not find the function/i.test(erro.message ?? "");
}
