import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { escolherWorkspace } from "@/lib/supabase/escolher-workspace";
import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";

/**
 * Espaço compartilhado da dupla (workspace).
 *
 * Um workspace reúne as duas contas que planejam juntas. Buscas, roteiro e
 * despesas compartilhadas ficam vinculados ao `workspace_id`, de modo que os
 * dois usuários veem e editam o mesmo planejamento.
 *
 * Tudo degrada graciosamente: sem Supabase/sessão, devolve null e as features
 * continuam funcionando em "modo convidado" (sem persistência cruzada).
 */

export interface Workspace {
  id: string;
  nome: string;
  codigo: string;
  papel: "dono" | "parceiro";
}

/** Sessão já verificada (`withAuthAction` / `obterSessao`): cliente e usuário. */
export interface SessaoWorkspace {
  supabase: SupabaseClient;
  userId: string;
}

async function resolverWorkspace({ supabase, userId }: SessaoWorkspace): Promise<Workspace | null> {
  // Já é membro de algum workspace? Escolha determinística: quem aceitou um
  // convite fica no espaço COMPARTILHADO (papel "parceiro"), não no espaço
  // vazio criado automaticamente no primeiro acesso; empate → o mais recente.
  const { data: membros } = await supabase
    .from("workspace_members")
    .select("papel, created_at, workspace_id, workspaces(id, nome, codigo)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const lista = (membros ?? []) as unknown as {
    papel: string;
    workspaces: { id: string; nome: string; codigo: string } | null;
  }[];
  const membro = escolherWorkspace(lista);

  if (membro?.workspaces) {
    return {
      id: membro.workspaces.id,
      nome: membro.workspaces.nome,
      codigo: membro.workspaces.codigo,
      papel: membro.papel === "dono" ? "dono" : "parceiro",
    };
  }

  // Cria um workspace novo; a trigger registra o dono como membro.
  const { data: novo, error } = await supabase
    .from("workspaces")
    .insert({ nome: "Nossa Viagem", owner_id: userId })
    .select("id, nome, codigo")
    .single();

  if (error || !novo) return null;
  return { id: novo.id, nome: novo.nome, codigo: novo.codigo, papel: "dono" };
}

/**
 * Resolve o workspace ativo do usuário logado. Se o usuário ainda não tem
 * workspace, cria um automaticamente (ele vira dono). Devolve null quando não
 * há Supabase configurado ou sessão.
 *
 * Dentro de uma Server Action, passe a `sessao` do `withAuthAction`: sem ela,
 * esta função cria outro cliente e repete o `getClaims` (que, com chave
 * HS256, é uma ida ao Auth). O `cache` do React deduplica por argumento
 * dentro da mesma requisição.
 */
export const getWorkspaceAtual = cache(async (sessao?: SessaoWorkspace): Promise<Workspace | null> => {
  if (sessao) return resolverWorkspace(sessao);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const userId = await getCurrentUserId(supabase);
  if (!userId) return null;
  return resolverWorkspace({ supabase, userId });
});
