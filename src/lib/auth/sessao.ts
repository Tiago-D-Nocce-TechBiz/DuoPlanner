import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sessão verificada para Server Actions e Route Handlers.
 *
 * Server Actions são endpoints públicos: o Next.js aceita o POST com o
 * cabeçalho `Next-Action` em QUALQUER rota, inclusive nas que o `proxy.ts`
 * não cobre ("/", "/login"). Por isso toda action e toda rota privada chama
 * `obterSessao()` antes de qualquer trabalho; o proxy é só a primeira camada.
 *
 * `getClaims()` valida a assinatura do JWT (JWKS com chaves assimétricas, ou o
 * servidor de Auth em projetos com segredo HS256). `getSession()` nunca é usado
 * no servidor: ele só decodifica o cookie, sem validar.
 */

export interface Sessao {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
}

export type MotivoSemSessao = "nao_configurado" | "nao_autenticado";

export type ResultadoSessao =
  | { ok: true; sessao: Sessao }
  | { ok: false; motivo: MotivoSemSessao; mensagem: string };

const MENSAGENS: Record<MotivoSemSessao, string> = {
  nao_configurado: "O serviço de contas está indisponível no momento. Tente mais tarde.",
  nao_autenticado: "Sua sessão expirou. Entre de novo para continuar.",
};

function semSessao(motivo: MotivoSemSessao): ResultadoSessao {
  return { ok: false, motivo, mensagem: MENSAGENS[motivo] };
}

export async function obterSessao(): Promise<ResultadoSessao> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return semSessao("nao_configurado");

  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    const sub = claims?.sub;
    if (error || typeof sub !== "string" || sub.length === 0) {
      return semSessao("nao_autenticado");
    }
    const email = typeof claims?.email === "string" && claims.email ? claims.email : null;
    return { ok: true, sessao: { supabase, userId: sub, email } };
  } catch {
    return semSessao("nao_autenticado");
  }
}

/** Variante para Route Handlers: devolve a resposta 401/503 pronta (JSON). */
export async function exigirSessaoApi(): Promise<
  { ok: true; sessao: Sessao } | { ok: false; resposta: NextResponse }
> {
  const resultado = await obterSessao();
  if (resultado.ok) return resultado;
  const naoConfigurado = resultado.motivo === "nao_configurado";
  return {
    ok: false,
    resposta: NextResponse.json(
      {
        error: resultado.mensagem,
        code: naoConfigurado ? "AUTH_NAO_CONFIGURADO" : "NAO_AUTENTICADO",
      },
      { status: naoConfigurado ? 503 : 401 }
    ),
  };
}
