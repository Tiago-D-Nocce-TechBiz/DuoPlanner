import { NextResponse, type NextRequest } from "next/server";
import { recusarSeNaoForCron } from "@/lib/cron/autorizacao";
import { enviarResumosSemanais } from "@/lib/cron/resumo-semanal";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/cron/resumo-semanal — Resumo Semanal do Orçamento por e-mail.
 *
 * Agendado em vercel.json para toda segunda às 11:00 UTC (08:00 em Brasília).
 * Protegido por `Authorization: Bearer ${CRON_SECRET}`. Rodar de novo na
 * mesma semana só atende quem ainda não foi processado.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const recusa = recusarSeNaoForCron(request);
  if (recusa) return recusa;

  const admin = criarClienteAdmin();
  if (!admin) {
    console.error("[cron:resumo] SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) ausente.");
    return NextResponse.json({ ok: false, erro: "Banco não configurado para tarefas agendadas." }, { status: 503 });
  }

  const resultado = await enviarResumosSemanais(admin, { prazoMs: 45_000 });
  if (!resultado.ok) return NextResponse.json({ ok: false, erro: resultado.mensagem }, { status: 503 });
  return NextResponse.json({ ok: true, ...resultado.resumo });
}
