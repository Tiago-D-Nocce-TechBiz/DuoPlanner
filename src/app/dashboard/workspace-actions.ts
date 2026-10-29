"use server";

import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";
import { getWorkspaceAtual } from "@/lib/supabase/workspace";

/**
 * Ações de compartilhamento de conta (workspace) usadas pelo painel.
 *
 * - `gerarConvite`: cria (ou reaproveita) um convite real no banco para o
 *   workspace do usuário logado e devolve o código + o link pronto.
 * - `estadoCompartilhamento`: informa se há sessão, o código do workspace e
 *   quantas pessoas já estão no espaço — para a UI mostrar dados reais.
 *
 * Tudo degrada com mensagens claras quando não há Supabase/sessão, para a UI
 * não quebrar em modo demonstração.
 */

export interface ConviteResult {
  ok: boolean;
  codigo?: string;
  link?: string;
  mensagem: string;
}

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://plannerduo-vert.vercel.app";

export async function gerarConvite(emailConvidado?: string): Promise<ConviteResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, mensagem: "Entre com sua conta para gerar convites reais." };
  }

  const userId = await getCurrentUserId(supabase);
  if (!userId) {
    return { ok: false, mensagem: "Entre com sua conta para gerar convites reais." };
  }

  const ws = await getWorkspaceAtual();
  if (!ws) {
    return { ok: false, mensagem: "Não foi possível resolver seu espaço compartilhado." };
  }

  const { data, error } = await supabase
    .from("convites")
    .insert({
      workspace_id: ws.id,
      email_convidado: emailConvidado?.trim() || null,
      convidado_por: userId,
    })
    .select("codigo")
    .single();

  if (error || !data) {
    return { ok: false, mensagem: "Não foi possível gerar o convite. Tente novamente." };
  }

  const codigo = String(data.codigo);
  return {
    ok: true,
    codigo,
    link: `${BASE_URL}/convite?code=${encodeURIComponent(codigo)}`,
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
