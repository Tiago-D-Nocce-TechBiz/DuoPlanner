import { NextResponse } from "next/server";
import { buscarCotacoes } from "@/lib/cambio/cotacoes";

/**
 * GET /api/cotacoes — cotações do dia em reais para o Conversor.
 *
 * Público e sem dado pessoal. A consulta ao serviço externo fica em cache
 * (`buscarCotacoes`, 1 hora), então esta rota não multiplica chamadas.
 * Sempre responde 200; `ok: false` significa "use as taxas de referência".
 */
export async function GET() {
  return NextResponse.json(await buscarCotacoes());
}
