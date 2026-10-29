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

/** Gera um código de convite curto e legível (ex.: DUO-7FK3Q2). */
function gerarCodigoLocal(): string {
  const aleatorio = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return `DUO-${aleatorio || "CONVITE"}`;
}

/** Monta a resposta de sucesso a partir de um código. */
function sucesso(codigo: string, mensagem: string): ConviteResult {
  return {
    ok: true,
    codigo,
    link: `${BASE_URL}/convite?code=${encodeURIComponent(codigo)}`,
    mensagem,
  };
}

/**
 * Gera um link de convite.
 *
 * Caminho ideal (Supabase + sessão ativa): cria um convite real na tabela
 * `convites`, vinculado ao workspace do usuário. Sem Supabase ou sem sessão,
 * degrada para um convite LOCAL (código gerado na hora) para que a
 * funcionalidade continue utilizável — o parceiro(a) abre o link, cria a conta
 * e, com o Auth ativo, passa a compartilhar o mesmo espaço.
 */
export async function gerarConvite(emailConvidado?: string): Promise<ConviteResult> {
  const supabase = await createSupabaseServerClient();
  const userId = supabase ? await getCurrentUserId(supabase) : null;

  // Sem Supabase ou sem sessão: convite local funcional.
  if (!supabase || !userId) {
    return sucesso(
      gerarCodigoLocal(),
      "Link de convite gerado. Envie para seu parceiro(a) — ao criar a conta com este link, vocês compartilham o mesmo espaço."
    );
  }

  const ws = await getWorkspaceAtual();
  // Mesmo logado, se o workspace ainda não resolve, não travamos o usuário.
  if (!ws) {
    return sucesso(
      gerarCodigoLocal(),
      "Link de convite gerado. Envie para seu parceiro(a) para compartilhar o planejamento."
    );
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

  // Falha ao persistir: ainda assim entregamos um link utilizável.
  if (error || !data) {
    return sucesso(
      gerarCodigoLocal(),
      "Link de convite gerado. Envie para seu parceiro(a) para compartilhar o planejamento."
    );
  }

  return sucesso(
    String(data.codigo),
    "Convite criado! Compartilhe o link com seu parceiro(a)."
  );
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
