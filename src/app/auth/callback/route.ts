import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { destinoPosConfirmacao } from "@/lib/auth/seguranca";

/**
 * GET /auth/callback — retorno do link de confirmação de e-mail do Supabase.
 *
 * Troca o `code` (PKCE) por uma sessão e segue para `next` (convite pendente
 * ou painel), validado contra open redirect. Se a troca não der certo (link
 * aberto em outro navegador, link antigo), o e-mail já está confirmado: manda
 * para o login, mantendo o convite.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const destino = destinoPosConfirmacao(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(destino, origin));
    }
  }

  const login = new URL("/login", origin);
  login.searchParams.set("confirmado", "1");
  const convite = /^\/convite\?code=([A-Za-z0-9-]+)$/.exec(destino)?.[1];
  if (convite) login.searchParams.set("convite", convite);
  return NextResponse.redirect(login);
}
