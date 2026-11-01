"use server";

import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";
import { getWorkspaceAtual } from "@/lib/supabase/workspace";
import { SITE_URL } from "@/lib/auth/seguranca";

/**
 * Ações de compartilhamento de conta (workspace) usadas pelo painel.
 *
 * - `gerarConvite`: cria um convite real no banco para o workspace do usuário
 *   logado e devolve o código + o link pronto.
 * - `estadoCompartilhamento`: informa se há sessão, o código do workspace e
 *   quantas pessoas já estão no espaço — para a UI mostrar dados reais.
 *
 * Quando algo falha, a resposta diz o que aconteceu (ok: false). Antes, um
 * código aleatório que não existia no banco era devolvido como sucesso, e o
 * convite falhava só do lado de quem o recebia.
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
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, mensagem: "O compartilhamento está indisponível no momento. Tente mais tarde." };
  }
  const userId = await getCurrentUserId(supabase);
  if (!userId) {
    return { ok: false, mensagem: "Sua sessão expirou. Entre de novo para convidar alguém." };
  }

  const email = emailConvidado?.trim() ?? "";
  if (email && !EMAIL.test(email)) {
    return { ok: false, mensagem: "Confira o e-mail da pessoa convidada (ou deixe em branco)." };
  }

  const ws = await getWorkspaceAtual();
  if (!ws) {
    return { ok: false, mensagem: "Não foi possível preparar o espaço da dupla. Tente de novo em instantes." };
  }

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
    mensagem: "Convite criado! Compartilhe o link com seu parceiro(a).",
  };
}

export interface EstadoCompartilhamento {
  autenticado: boolean;
  nomeWorkspace?: string;
  codigoWorkspace?: string;
  membros: number;
}

export async function estadoCompartilhamento(): Promise<EstadoCompartilhamento> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { autenticado: false, membros: 0 };

  const userId = await getCurrentUserId(supabase);
  if (!userId) return { autenticado: false, membros: 0 };

  const ws = await getWorkspaceAtual();
  if (!ws) return { autenticado: true, membros: 0 };

  const { count } = await supabase
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
