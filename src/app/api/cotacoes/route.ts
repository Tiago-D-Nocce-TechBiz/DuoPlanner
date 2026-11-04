import { NextResponse } from "next/server";
import { buscarCotacoes } from "@/lib/cambio/cotacoes";

/**
 * GET /api/cotacoes — cotações do dia em reais para o Conversor.
 *
 * Pública DE PROPÓSITO (decisão revisada na auditoria de segurança): não tem
 * dado pessoal, não custa nada (AwesomeAPI gratuita) e o build a gera como
 * estática com revalidação de 1 hora, servida pelo CDN. Exigir sessão leria
 * cookies e a tornaria dinâmica — mais invocações, nenhum risco a menos.
 * O Service Worker guarda a última resposta para o Conversor funcionar offline.
 *
 * Sempre responde 200; `ok: false` significa "use as taxas de referência".
 */
export async function GET() {
  return NextResponse.json(await buscarCotacoes());
}
