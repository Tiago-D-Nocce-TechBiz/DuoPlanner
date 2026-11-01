"use server";

import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";
import {
  SITE_URL,
  codigoConviteValido,
  destinoSeguro,
  funcaoRpcAusente,
} from "@/lib/auth/seguranca";

/**
 * Autenticação real via Supabase Auth (e-mail/senha) + pareamento de contas.
 *
 * As ações devolvem um estado de erro (string) para o cliente exibir, ou
 * redirecionam em caso de sucesso. Quando o Supabase não está configurado,
 * caímos num modo de demonstração que apenas navega para o painel (sem sessão
 * real), mantendo o fluxo utilizável.
 *
 * Convite: o código digitado no cadastro fica guardado na conta
 * (`user_metadata.convite_pendente`) e é aplicado no primeiro login, mesmo
 * quando o Supabase exige confirmar o e-mail antes (sem sessão no cadastro).
 */

export type AuthState = { erro?: string } | void;

/** Entrar com e-mail e senha. */
export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? formData.get("password") ?? "");
  const destino = destinoSeguro(String(formData.get("redirect") ?? ""));
  const conviteDoForm = codigoConviteValido(String(formData.get("codigoConvite") ?? ""));

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    // Modo demonstração: sem Supabase, apenas navega.
    redirect(destino);
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) {
    return { erro: traduzErroSupabase(error.message) };
  }

  // Convite do link (?convite=) ou guardado no cadastro: a página /convite
  // aceita e mostra o resultado (sucesso → painel; erro → mensagem clara).
  const pendente = codigoConviteValido(
    String((data.user?.user_metadata as { convite_pendente?: unknown } | undefined)?.convite_pendente ?? "")
  );
  if (pendente) {
    await supabase.auth.updateUser({ data: { convite_pendente: null } });
  }
  const convite = conviteDoForm ?? pendente;
  if (convite) {
    redirect(`/convite?code=${encodeURIComponent(convite)}`);
  }

  redirect(destino);
}

/** Criar conta; opcionalmente já aceitando um convite por código. */
export async function cadastroAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? formData.get("password") ?? "");
  const conviteDigitado = String(formData.get("codigoConvite") ?? "").trim();
  const codigoConvite = codigoConviteValido(conviteDigitado);

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
  if (conviteDigitado && !codigoConvite) {
    return { erro: "Código de convite inválido. Confira o link recebido ou deixe o campo em branco." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirect("/dashboard");
  }

  // Depois de confirmar o e-mail, o link volta para /auth/callback, que abre
  // a sessão e segue para o convite (ou para o painel).
  const next = codigoConvite ? `/convite?code=${codigoConvite}` : "/dashboard";
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      data: {
        nome: nome || email.split("@")[0],
        ...(codigoConvite ? { convite_pendente: codigoConvite } : {}),
      },
      emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    return { erro: traduzErroSupabase(error.message) };
  }

  // Dependendo da configuração do projeto, pode exigir confirmação por e-mail.
  if (!data.session) {
    return {
      erro: codigoConvite
        ? "Conta criada! Confirme o e-mail enviado e depois entre: o convite será aplicado no primeiro acesso."
        : "Conta criada! Confirme o e-mail enviado para concluir e depois entre.",
    };
  }

  // Sessão já aberta (confirmação de e-mail desligada no projeto).
  if (codigoConvite) {
    await supabase.auth.updateUser({ data: { convite_pendente: null } });
    redirect(`/convite?code=${encodeURIComponent(codigoConvite)}`);
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
  codigoBruto: string
): Promise<{ ok: boolean; mensagem: string }> {
  const codigo = codigoConviteValido(codigoBruto);
  if (!codigo) return { ok: false, mensagem: "Convite inválido." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, mensagem: "Supabase não configurado." };

  const userId = await getCurrentUserId(supabase);
  if (!userId) {
    return { ok: false, mensagem: "Entre na sua conta para aceitar o convite." };
  }

  // Caminho seguro: RPC `aceitar_convite` (security-hardening.sql), que valida
  // e grava sem expor a tabela de convites.
  const rpc = await supabase.rpc("aceitar_convite", { p_codigo: codigo });
  if (!rpc.error) {
    const linha = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as
      | { ok?: boolean; mensagem?: string }
      | null;
    return {
      ok: Boolean(linha?.ok),
      mensagem: String(linha?.mensagem ?? "Não foi possível aceitar o convite agora."),
    };
  }
  if (!funcaoRpcAusente(rpc.error)) {
    console.error("[convites] falha na RPC aceitar_convite:", rpc.error.message);
    return { ok: false, mensagem: "Não foi possível aceitar o convite agora. Tente de novo em instantes." };
  }

  // Caminho antigo, só enquanto a RPC não existe no banco (SQL de
  // endurecimento ainda não aplicado). Depois do SQL, nunca é usado.
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
