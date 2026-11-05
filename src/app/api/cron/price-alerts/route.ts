import { NextResponse, type NextRequest } from "next/server";
import { recusarSeNaoForCron } from "@/lib/cron/autorizacao";
import { monitorarAlertas } from "@/lib/cron/alertas-preco";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/cron/price-alerts — monitor diário dos Alertas de Preço.
 *
 * Agendado em vercel.json (todo dia às 11:00 UTC = 08:00 em Brasília; no
 * plano Hobby a Vercel dispara em algum momento dentro dessa hora). Protegido
 * por `Authorization: Bearer ${CRON_SECRET}`, que a Vercel envia sozinha.
 * Para rodar à mão: curl -H "Authorization: Bearer $CRON_SECRET" <url>.
 *
 * Usa a chave secreta do Supabase (sem usuário logado). Responde um resumo
 * do que fez, sem dados pessoais.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const recusa = recusarSeNaoForCron(request);
  if (recusa) return recusa;

  const admin = criarClienteAdmin();
  if (!admin) {
    console.error("[cron:alertas] SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) ausente.");
    return NextResponse.json({ ok: false, erro: "Banco não configurado para tarefas agendadas." }, { status: 503 });
  }

  // Margem de 10 s sobre o maxDuration para gravar o que já foi buscado.
  const resultado = await monitorarAlertas(admin, { prazoMs: 45_000 });
  if (!resultado.ok) return NextResponse.json({ ok: false, erro: resultado.mensagem }, { status: 503 });
  return NextResponse.json({ ok: true, ...resultado.resumo });
}
