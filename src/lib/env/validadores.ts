/**
 * Validadores puros das variáveis de ambiente.
 *
 * Também rodam no navegador (via `./publico`): nada de `node:*` nem de zod.
 * A versão completa, com zod e as regras entre variáveis, fica em `./esquema`.
 */

export const SITE_URL_PADRAO = "https://duoplanner-vert.vercel.app";

/** Valor vazio ou só espaços conta como ausente (linhas `CHAVE=` do .env). */
export function vazioParaAusente(valor: string | undefined | null): string | undefined {
  const limpo = valor?.trim();
  return limpo ? limpo : undefined;
}

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * URL https (ou http só em localhost, para desenvolvimento), sem usuário e
 * senha embutidos. Devolve a URL sem barra final, ou null se inválida.
 */
export function urlValida(valor: string): string | null {
  try {
    const url = new URL(valor);
    if (url.username || url.password) return null;
    const httpLocal = url.protocol === "http:" && HOSTS_LOCAIS.has(url.hostname);
    if (url.protocol !== "https:" && !httpLocal) return null;
    return valor.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** Papel embutido numa chave JWT antiga do Supabase ("anon", "service_role"). */
export function papelDaChaveJwt(chave: string): string | null {
  const partes = chave.split(".");
  if (partes.length !== 3) return null;
  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const preenchido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const conteudo: unknown = JSON.parse(atob(preenchido));
    const papel = (conteudo as { role?: unknown } | null)?.role;
    return typeof papel === "string" ? papel : null;
  } catch {
    return null;
  }
}

/** Chave que ignora a RLS (secret/service_role): nunca pode chegar ao navegador. */
export function chaveEhSecreta(chave: string): boolean {
  return chave.startsWith("sb_secret_") || papelDaChaveJwt(chave) === "service_role";
}

/** Chave pública (publishable/anon), segura no navegador. */
export function chaveEhPublica(chave: string): boolean {
  return chave.startsWith("sb_publishable_") || papelDaChaveJwt(chave) === "anon";
}

/**
 * Base64 (padrão ou url-safe) que decodifica em exatamente `bytes` bytes.
 * Mesmo critério de `lerChaveCifra` (cifra dos documentos).
 */
export function base64ComBytes(valor: string, bytes: number): boolean {
  const normalizado = valor.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizado)) return false;
  try {
    const preenchido = normalizado.padEnd(normalizado.length + ((4 - (normalizado.length % 4)) % 4), "=");
    return atob(preenchido).length === bytes;
  } catch {
    return false;
  }
}

const EMAIL = "[^\\s@<>()\",;:]+@[^\\s@<>()\",;:]+\\.[^\\s@<>()\",;:.]{2,}";
const REMETENTE = new RegExp(`^(?:[^<>]{1,80}<\\s*${EMAIL}\\s*>|${EMAIL})$`);

/** Remetente no formato "Nome <email@dominio>" ou "email@dominio". */
export function remetenteValido(valor: string): boolean {
  return REMETENTE.test(valor.trim());
}

/** Nome de host sem protocolo nem caminho (ex.: booking-com15.p.rapidapi.com). */
export function hostValido(valor: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(valor.trim());
}
