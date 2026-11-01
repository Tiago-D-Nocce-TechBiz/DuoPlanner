import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proteção de rotas do painel (Proxy — convenção atual do Next 16, substitui o
 * antigo "middleware").
 *
 * Qualquer acesso a /dashboard/* exige sessão ativa do Supabase. Sem sessão, o
 * usuário é redirecionado para /login (com ?redirect= para voltar ao destino
 * depois de entrar). /api/flights e /api/hotels também exigem sessão e
 * respondem 401 em JSON.
 *
 * Degradação graciosa: se as variáveis do Supabase não estiverem configuradas
 * no ambiente, o proxy não bloqueia (deixa passar), para não travar o
 * desenvolvimento antes de o Auth estar ligado.
 *
 * Também mantém a sessão renovada: o createServerClient reescreve os cookies
 * de auth na resposta quando necessário.
 */
/** Sem sessão: páginas vão para o login; APIs respondem 401 em JSON. */
function negarAcesso(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Sua sessão expirou. Entre de novo para buscar preços.", code: "NAO_AUTENTICADO" },
      { status: 401 }
    );
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail-closed: sem configuração do Supabase não há como validar a sessão.
  // Em produção, bloqueamos o painel (redireciona ao login) para não deixar
  // /dashboard/* aberto por acidente. Só em desenvolvimento local deixamos
  // passar, para não travar quem ainda não ligou o Auth.
  if (!url || !key) {
    if (process.env.NODE_ENV === "production") return negarAcesso(request);
    return NextResponse.next();
  }

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

  if (!autenticado) return negarAcesso(request);

  return response;
}

// Painel e APIs de preço (consomem cota paga da Kiwi/RapidAPI: só com login).
export const config = {
  matcher: ["/dashboard/:path*", "/api/flights", "/api/hotels"],
};
