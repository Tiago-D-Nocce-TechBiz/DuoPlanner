"use server";

import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";

/**
 * Autenticação real via Supabase Auth (e-mail/senha) + pareamento de contas.
 *
 * As ações devolvem um estado de erro (string) para o cliente exibir, ou
 * redirecionam para o dashboard em caso de sucesso. Quando o Supabase não está
 * configurado, caímos num modo de demonstração que apenas navega para o painel
 * (sem sessão real), mantendo o fluxo utilizável.
 */

export type AuthState = { erro?: string } | void;

/** Entrar com e-mail e senha. */
export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? formData.get("password") ?? "");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    // Modo demonstração: sem Supabase, apenas navega.
    redirect("/dashboard");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) {
    return { erro: traduzErroSupabase(error.message) };
  }

  redirect("/dashboard");
}

/** Criar conta; opcionalmente já aceitando um convite por código. */
export async function cadastroAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? formData.get("password") ?? "");
  const codigoConvite = String(formData.get("codigoConvite") ?? "").trim();

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha para criar a conta." };
  }
  if (senha.length < 8) {
    return { erro: "A senha deve ter pelo menos 8 caracteres." };
  }
  // Exige ao menos uma letra e um número, para reduzir senhas fracas.
  if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) {
    return { erro: "Use ao menos uma letra e um número na senha." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirect("/dashboard");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { data: { nome: nome || email.split("@")[0] } },
  });
  if (error) {
    return { erro: traduzErroSupabase(error.message) };
  }

  // Se veio com código de convite e já há sessão (confirmação desativada),
  // vincula a conta ao workspace do convite.
  if (codigoConvite && data.session) {
    await aceitarConvitePorCodigo(codigoConvite);
  }

  // Dependendo da configuração do projeto, pode exigir confirmação por e-mail.
  if (!data.session) {
    return {
      erro:
        "Conta criada! Confirme o e-mail enviado para concluir e depois entre.",
    };
  }

  redirect("/dashboard");
}

/** Encerra a sessão e volta à página inicial. */
export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/");
}

/**
 * Vincula o usuário logado ao workspace de um convite (por código).
 * Usada no fluxo de cadastro e na página /convite.
 */
export async function aceitarConvitePorCodigo(
  codigo: string
): Promise<{ ok: boolean; mensagem: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, mensagem: "Supabase não configurado." };

  const userId = await getCurrentUserId(supabase);
  if (!userId) {
    return { ok: false, mensagem: "Entre na sua conta para aceitar o convite." };
  }

  const { data: convite } = await supabase
    .from("convites")
    .select("id, workspace_id, status")
    .eq("codigo", codigo)
    .maybeSingle();

  // Só aceita convites PENDENTES (não revogados nem já aceitos), evitando
  // reuso indevido de códigos.
  if (!convite) {
    return { ok: false, mensagem: "Convite inválido." };
  }
  if (convite.status !== "pendente") {
    return {
      ok: false,
      mensagem:
        convite.status === "revogado"
          ? "Este convite foi revogado."
          : "Este convite já foi utilizado.",
    };
  }

  const { error: erroMembro } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: convite.workspace_id, user_id: userId, papel: "parceiro" });

  // Conflito (já é membro) não é erro para o usuário.
  if (erroMembro && !erroMembro.message.includes("duplicate")) {
    return { ok: false, mensagem: traduzErroSupabase(erroMembro.message) };
  }

  await supabase.from("convites").update({ status: "aceito" }).eq("id", convite.id);
  return { ok: true, mensagem: "Conta vinculada ao espaço compartilhado!" };
}

/** Converte mensagens comuns do Supabase para PT-BR. */
function traduzErroSupabase(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Este e-mail já tem uma conta. Tente entrar.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("password")) return "Senha inválida (mínimo de 8 caracteres, com letra e número).";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde um instante.";
  return "Não foi possível concluir. Tente novamente.";
}
