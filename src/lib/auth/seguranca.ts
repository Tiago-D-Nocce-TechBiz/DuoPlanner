/**
 * Regras puras de segurança do fluxo de login e convite (testáveis, sem I/O).
 */

import { ambientePublico } from "@/lib/env/publico";

/** URL pública do app (links de convite e retorno da confirmação de e-mail). */
export const SITE_URL = ambientePublico.siteUrl;

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

/**
 * O erro indica coluna inexistente (app publicado antes da migration que a
 * cria): PGRST204 ao gravar uma coluna que o cache do PostgREST não conhece;
 * 42703 do Postgres ao ler. Mesmo tratamento da tabela ausente: "modo local".
 */
export function colunaAusente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return (
    erro.code === "PGRST204" ||
    erro.code === "42703" ||
    /could not find the '.+' column|column .+ does not exist/i.test(erro.message ?? "")
  );
}

/**
 * O erro indica tabela inexistente (migration ainda não aplicada): PostgREST
 * 12+ responde PGRST205; versões antigas repassam o 42P01 do Postgres.
 */
export function tabelaAusente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return (
    erro.code === "PGRST205" ||
    erro.code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(erro.message ?? "")
  );
}
