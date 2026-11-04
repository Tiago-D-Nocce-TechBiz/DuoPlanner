"use server";

import { obterSessao } from "@/lib/auth/sessao";
import { getWorkspaceAtual } from "@/lib/supabase/workspace";
import { SITE_URL } from "@/lib/auth/seguranca";
import { consumirCota } from "@/lib/seguranca/cotas";

/**
 * Ações de compartilhamento de conta (workspace) usadas pelo painel.
 *
 * - `gerarConvite`: cria um convite real no banco para o workspace do usuário
 *   logado e devolve o código + o link pronto. Limite: cota "convite"
 *   (10 por dia), porque cada convite pode disparar um e-mail.
 * - `estadoCompartilhamento`: informa se há sessão, o código do workspace e
 *   quantas pessoas já estão no espaço — para a UI mostrar dados reais.
 *
 * Toda action verifica a sessão (getClaims) por conta própria.
 */

export interface ConviteResult {
  ok: boolean;
  codigo?: string;
  link?: string;
  mensagem: string;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/** Gera um link de convite (convite real, salvo na tabela `convites`). */
export async function gerarConvite(emailConvidado?: string): Promise<ConviteResult> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, mensagem: auth.mensagem };
  const { supabase, userId } = auth.sessao;

  const email = typeof emailConvidado === "string" ? emailConvidado.trim().toLowerCase() : "";
  if (email && (email.length > 254 || !EMAIL.test(email))) {
    return { ok: false, mensagem: "Confira o e-mail da pessoa convidada (ou deixe em branco)." };
  }

  const ws = await getWorkspaceAtual();
  if (!ws) {
    return { ok: false, mensagem: "Não foi possível preparar o espaço da dupla. Tente de novo em instantes." };
  }

  const cota = await consumirCota(supabase, userId, "convite");
  if (!cota.permitido) return { ok: false, mensagem: cota.mensagem };

  const { data, error } = await supabase
    .from("convites")
    .insert({
      workspace_id: ws.id,
      email_convidado: email || null,
      convidado_por: userId,
    })
    .select("codigo")
    .single();

  if (error || !data) {
    if (error) console.error("[convites] falha ao criar convite:", error.message);
    return { ok: false, mensagem: "Não foi possível criar o convite agora. Tente de novo em instantes." };
  }

  const codigo = String(data.codigo);
  return {
    ok: true,
    codigo,
    link: `${SITE_URL}/convite?code=${encodeURIComponent(codigo)}`,
    mensagem: "Convite criado! Compartilhe o link com seu parceiro(a). Ele vale por 7 dias.",
  };
}

export interface EstadoCompartilhamento {
  autenticado: boolean;
  nomeWorkspace?: string;
  codigoWorkspace?: string;
  membros: number;
}

export async function estadoCompartilhamento(): Promise<EstadoCompartilhamento> {
  const auth = await obterSessao();
  if (!auth.ok) return { autenticado: false, membros: 0 };

  const ws = await getWorkspaceAtual();
  if (!ws) return { autenticado: true, membros: 0 };

  const { count } = await auth.sessao.supabase
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws.id);

  return {
    autenticado: true,
    nomeWorkspace: ws.nome,
    codigoWorkspace: ws.codigo,
    membros: count ?? 1,
  };
}
