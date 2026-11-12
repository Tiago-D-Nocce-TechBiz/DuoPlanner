import { emProducao } from "./modo";
import { chaveEhSecreta, SITE_URL_PADRAO, urlValida, vazioParaAusente } from "./validadores";

/**
 * Ambiente público: o que pode ir para o navegador (NEXT_PUBLIC_* e NODE_ENV).
 *
 * Cada variável é lida pelo nome literal: o Next só substitui
 * `process.env.NEXT_PUBLIC_X` escrito assim no build (acesso dinâmico fica
 * vazio no navegador). Aqui nada lança: valor malformado vira "ausente" e o
 * app degrada. Quem barra a configuração quebrada é a validação do servidor
 * (`instrumentation.ts`), no boot e no build.
 */

const urlSupabase = vazioParaAusente(process.env.NEXT_PUBLIC_SUPABASE_URL);
const chaveSupabase =
  vazioParaAusente(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
  vazioParaAusente(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const siteUrl = vazioParaAusente(process.env.NEXT_PUBLIC_SITE_URL);

function supabasePublico(): { url: string; chavePublica: string } | null {
  const url = urlSupabase ? urlValida(urlSupabase) : null;
  // Chave secreta nunca é usada no navegador, mesmo que alguém a exponha.
  if (!url || !chaveSupabase || chaveEhSecreta(chaveSupabase)) return null;
  return { url, chavePublica: chaveSupabase };
}

export const ambientePublico = {
  producao: emProducao,
  supabase: supabasePublico(),
  siteUrl: (siteUrl && urlValida(siteUrl)) || SITE_URL_PADRAO,
} as const;
