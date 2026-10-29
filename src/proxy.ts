import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proteção de rotas do painel (Proxy — convenção atual do Next 16, substitui o
 * antigo "middleware").
 *
 * Qualquer acesso a /dashboard/* exige sessão ativa do Supabase. Sem sessão, o
 * usuário é redirecionado para /login (com ?redirect= para voltar ao destino
 * depois de entrar).
 *
 * Degradação graciosa: se as variáveis do Supabase não estiverem configuradas
 * no ambiente, o proxy não bloqueia (deixa passar), para não travar o
 * desenvolvimento antes de o Auth estar ligado.
 *
 * Também mantém a sessão renovada: o createServerClient reescreve os cookies
 * de auth na resposta quando necessário.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem configuração do Supabase: não há como validar sessão; deixa passar.
  if (!url || !key) return NextResponse.next();

  // Resposta mutável para o Supabase poder atualizar cookies de sessão.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getClaims valida o JWT (não confiar em getSession no middleware).
  let autenticado = false;
  try {
    const { data } = await supabase.auth.getClaims();
    autenticado = typeof data?.claims?.sub === "string" && data.claims.sub.length > 0;
  } catch {
    autenticado = false;
  }

  if (!autenticado) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// Protege apenas as rotas do painel.
export const config = {
  matcher: ["/dashboard/:path*"],
};
