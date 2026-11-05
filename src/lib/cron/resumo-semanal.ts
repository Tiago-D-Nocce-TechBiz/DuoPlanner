import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL, tabelaAusente } from "@/lib/auth/seguranca";
import { todayInSaoPaulo } from "@/lib/dates";
import { emailResumoSemanal } from "@/lib/email/templates";
import {
  montarResumoSemanal,
  resumoJaProcessado,
  semanaAnterior,
  type MembroResumo,
} from "@/lib/finance/resumo-semanal";
import { enviarEmail } from "@/lib/mail";
import { criarLeitorDeEmails } from "@/lib/supabase/admin";
import { escolherWorkspace } from "@/lib/supabase/escolher-workspace";
import { acordoDaLinha, ACORDO_PADRAO, type AcordoDivisao } from "@/lib/sync/contexto";
import { COLUNAS, despesaDaLinha, type Despesa } from "@/lib/sync/modelos";

/**
 * Resumo Semanal do Orçamento (chamado por /api/cron/resumo-semanal).
 *
 * Para quem deixou o resumo ligado em Configurações: gastos da semana
 * anterior (segunda a domingo) no espaço do casal, os gastos privados da
 * própria pessoa e o saldo do acerto. Quem não tem nada a contar não recebe
 * e-mail. `perfis.resumo_semanal_enviado_em` marca quem já foi processado
 * nesta semana: rodar a tarefa de novo (à mão, ou porque o prazo acabou)
 * continua de onde parou, sem duplicar. Falha no envio não marca: a pessoa
 * entra na próxima rodada.
 *
 * Privacidade: a chave secreta ignora a RLS. A consulta já traz só o que
 * cabe (compartilhados do espaço e privados do próprio destinatário) e
 * `montarResumoSemanal` filtra de novo.
 */

export interface ResumoEnvio {
  enviados: number;
  semNovidades: number;
  semEmail: number;
  falhas: number;
  adiados: number;
}

const LOTE = 40;

type LinhaVinculo = {
  user_id: string;
  papel: string;
  workspaces: { id: string; nome: string } | { id: string; nome: string }[] | null;
};

const espacoDoVinculo = (v: LinhaVinculo) => (Array.isArray(v.workspaces) ? v.workspaces[0] ?? null : v.workspaces);

export async function enviarResumosSemanais(
  admin: SupabaseClient,
  opcoes: { prazoMs: number }
): Promise<{ ok: true; resumo: ResumoEnvio } | { ok: false; mensagem: string }> {
  const encerrarEm = Date.now() + opcoes.prazoMs;
  const hoje = todayInSaoPaulo();
  const periodo = semanaAnterior(hoje);
  const resumo: ResumoEnvio = { enviados: 0, semNovidades: 0, semEmail: 0, falhas: 0, adiados: 0 };

  const { data: inscritos, error } = await admin
    .from("perfis")
    .select("user_id, nome, resumo_semanal_enviado_em")
    .eq("email_resumo_semanal", true)
    .order("resumo_semanal_enviado_em", { ascending: true, nullsFirst: true })
    .limit(1000);
  if (error) {
    if (tabelaAusente(error)) return { ok: false, mensagem: "Banco sem a migration de sincronização (perfis)." };
    console.error("[cron:resumo] falha ao ler os perfis:", error.message);
    return { ok: false, mensagem: "Não foi possível ler os perfis." };
  }

  const pendentes = (inscritos ?? []).filter(
    (p) => !resumoJaProcessado(typeof p.resumo_semanal_enviado_em === "string" ? p.resumo_semanal_enviado_em : null, hoje)
  );
  const emailDe = criarLeitorDeEmails(admin);

  for (let i = 0; i < pendentes.length; i += LOTE) {
    if (Date.now() > encerrarEm) {
      resumo.adiados += pendentes.length - i;
      break;
    }
    const lote = pendentes.slice(i, i + LOTE);
    const ids = lote.map((p) => String(p.user_id));

    // Espaço de cada pessoa (mesma regra do painel).
    const { data: vinculos } = await admin
      .from("workspace_members")
      .select("user_id, papel, created_at, workspaces(id, nome)")
      .in("user_id", ids)
      .order("created_at", { ascending: false });
    const vinculosPorPessoa = new Map<string, LinhaVinculo[]>();
    for (const v of (vinculos ?? []) as unknown as LinhaVinculo[]) {
      const lista = vinculosPorPessoa.get(v.user_id) ?? [];
      lista.push(v);
      vinculosPorPessoa.set(v.user_id, lista);
    }
    const espacoDe = new Map<string, { id: string; nome: string }>();
    for (const id of ids) {
      const escolhido = escolherWorkspace(vinculosPorPessoa.get(id) ?? []);
      const espaco = escolhido ? espacoDoVinculo(escolhido) : null;
      if (espaco) espacoDe.set(id, espaco);
    }
    const espacos = [...new Set([...espacoDe.values()].map((w) => w.id))];

    const [membrosLidos, acordosLidos, compartilhadosLidos, privadosLidos] = await Promise.all([
      espacos.length
        ? admin.from("workspace_members").select("workspace_id, user_id, papel").in("workspace_id", espacos)
        : Promise.resolve({ data: [] as { workspace_id: string; user_id: string; papel: string }[], error: null }),
      espacos.length
        ? admin.from("acordos_divisao").select("*").in("workspace_id", espacos)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      espacos.length
        ? admin
            .from("despesas_viagem")
            .select(COLUNAS.despesas)
            .in("workspace_id", espacos)
            .eq("escopo", "viagem_compartilhado")
            .limit(20_000)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      admin
        .from("despesas_viagem")
        .select(COLUNAS.despesas)
        .in("user_id", ids)
        .eq("escopo", "pessoal_privado")
        .gte("data", periodo.inicio)
        .lte("data", periodo.fim)
        .limit(20_000),
    ]);
    const falhaLeitura = [membrosLidos, acordosLidos, compartilhadosLidos, privadosLidos].find((r) => r.error);
    if (falhaLeitura?.error) {
      console.error("[cron:resumo] falha ao ler os dados do lote:", falhaLeitura.error.message);
      resumo.falhas += lote.length;
      continue;
    }

    const membrosPorEspaco = new Map<string, { user_id: string; papel: string }[]>();
    for (const m of (membrosLidos.data ?? []) as { workspace_id: string; user_id: string; papel: string }[]) {
      const lista = membrosPorEspaco.get(m.workspace_id) ?? [];
      lista.push(m);
      membrosPorEspaco.set(m.workspace_id, lista);
    }
    const todos = [...new Set([...ids, ...[...membrosPorEspaco.values()].flat().map((m) => m.user_id)])];
    const { data: nomesLidos } = await admin.from("perfis").select("user_id, nome").in("user_id", todos);
    const nomeDe = new Map((nomesLidos ?? []).map((p) => [String(p.user_id), typeof p.nome === "string" ? p.nome : ""]));

    const acordoDe = new Map<string, AcordoDivisao>(
      ((acordosLidos.data ?? []) as Record<string, unknown>[]).map((l) => [String(l.workspace_id), acordoDaLinha(l)])
    );
    const compartilhadosDe = new Map<string, Despesa[]>();
    for (const l of (compartilhadosLidos.data ?? []) as unknown as Record<string, unknown>[]) {
      const d = despesaDaLinha(l);
      if (!d.workspaceId) continue;
      const lista = compartilhadosDe.get(d.workspaceId) ?? [];
      lista.push(d);
      compartilhadosDe.set(d.workspaceId, lista);
    }
    const privadosDe = new Map<string, Despesa[]>();
    for (const l of (privadosLidos.data ?? []) as unknown as Record<string, unknown>[]) {
      const d = despesaDaLinha(l);
      const lista = privadosDe.get(d.userId) ?? [];
      lista.push(d);
      privadosDe.set(d.userId, lista);
    }

    for (const pessoa of lote) {
      if (Date.now() > encerrarEm) {
        resumo.adiados++;
        continue;
      }
      const userId = String(pessoa.user_id);
      const espaco = espacoDe.get(userId) ?? null;
      const membros: MembroResumo[] = espaco
        ? (membrosPorEspaco.get(espaco.id) ?? []).map((m) => ({
            userId: m.user_id,
            nome: nomeDe.get(m.user_id) || "Seu par",
            papel: m.papel === "dono" ? "dono" : "parceiro",
          }))
        : [];
      const calculado = montarResumoSemanal({
        userId,
        workspaceId: espaco?.id ?? null,
        membros,
        acordo: espaco ? acordoDe.get(espaco.id) ?? ACORDO_PADRAO : ACORDO_PADRAO,
        despesas: [...(espaco ? compartilhadosDe.get(espaco.id) ?? [] : []), ...(privadosDe.get(userId) ?? [])],
        periodo,
      });

      const marcarProcessado = () =>
        admin.from("perfis").update({ resumo_semanal_enviado_em: new Date().toISOString() }).eq("user_id", userId);

      if (calculado.vazio) {
        resumo.semNovidades++;
        await marcarProcessado();
        continue;
      }
      const email = await emailDe(userId);
      if (!email) {
        resumo.semEmail++;
        continue;
      }
      const montado = emailResumoSemanal({
        nome: typeof pessoa.nome === "string" ? pessoa.nome : "",
        periodo,
        nomeEspaco: espaco?.nome ?? null,
        ...calculado,
        linkFinancas: `${SITE_URL}/dashboard/financas`,
        linkAcerto: `${SITE_URL}/dashboard/acerto`,
        linkPreferencias: `${SITE_URL}/dashboard/configuracoes`,
      });
      const envio = await enviarEmail({
        para: email,
        assunto: montado.assunto,
        html: montado.html,
        texto: montado.texto,
        idempotencia: `resumo-${userId}-${periodo.inicio}`,
        categoria: "resumo_semanal",
      });
      if (envio.ok) {
        resumo.enviados++;
        await marcarProcessado();
      } else {
        resumo.falhas++;
      }
    }
  }

  return { ok: true, resumo };
}
