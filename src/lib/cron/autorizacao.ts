import "server-only";
import { NextResponse } from "next/server";
import { TAMANHO_MINIMO_SEGREDO, verificarSegredoCron } from "./segredo";

/**
 * Porta de entrada das rotas /api/cron/*: devolve a resposta de recusa
 * (401 ou 503) ou null quando a chamada está autorizada.
 */
export function recusarSeNaoForCron(request: Request): NextResponse | null {
  const resultado = verificarSegredoCron(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (resultado === "ok") return null;
  if (resultado === "sem_segredo") {
    console.error(
      `[cron] CRON_SECRET ausente ou curto (mínimo de ${TAMANHO_MINIMO_SEGREDO} caracteres): tarefa recusada.`
    );
    return NextResponse.json({ ok: false, erro: "Tarefa agendada não configurada." }, { status: 503 });
  }
  return NextResponse.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
}
