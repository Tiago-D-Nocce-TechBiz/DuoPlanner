"use server";

import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/sessao";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SITE_URL,
  codigoConviteValido,
  destinoSeguro,
  funcaoRpcAusente,
} from "@/lib/auth/seguranca";
import {
  campoTexto,
  erroEmailJaCadastrado,
  esquemaCadastro,
  esquemaLogin,
  mensagemCadastroNeutra,
  primeiraMensagem,
} from "@/lib/auth/validacao";

/**
 * Autenticação real via Supabase Auth (e-mail/senha) + pareamento de contas.
 *
 * As ações devolvem um estado (erro ou aviso neutro) para o cliente exibir,
 * ou redirecionam em caso de sucesso. Entradas validadas com zod
 * (`@/lib/auth/validacao`). Quando o Supabase não está configurado, caímos
 * num modo de demonstração que apenas navega para o painel (sem sessão real).
 *
 * Convite: o código digitado no cadastro fica guardado na conta
 * (`user_metadata.convite_pendente`) e, no primeiro login, a pessoa vai para
 * /convite, onde CONFIRMA o aceite (POST). Antes, abrir o link já aceitava:
 * um link malicioso colocava a vítima no espaço de outra pessoa sem aviso.
 */

export type AuthState = { erro?: string; aviso?: string } | void;

/** Entrar com e-mail e senha. */
export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const lido = esquemaLogin.safeParse({
    email: campoTexto(formData, "email"),
    senha: campoTexto(formData, "senha", "password"),
    redirect: campoTexto(formData, "redirect"),
    codigoConvite: campoTexto(formData, "codigoConvite"),
  });
  if (!lido.success) return { erro: primeiraMensagem(lido.error) };
  const { email, senha } = lido.data;
  const destino = destinoSeguro(lido.data.redirect);
  const conviteDoForm = codigoConviteValido(lido.data.codigoConvite);

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    // Modo demonstração: sem Supabase, apenas navega.
    redirect(destino);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: traduzErroSupabase(error.message) };

  // Convite do link (?convite=) ou guardado no cadastro: a página /convite
  // mostra quem convidou e pede a confirmação.
  const pendente = codigoConviteValido(
    String((data.user?.user_metadata as { convite_pendente?: unknown } | undefined)?.convite_pendente ?? "")
  );
  if (pendente) {
    await supabase.auth.updateUser({ data: { convite_pendente: null } });
  }
  const convite = conviteDoForm ?? pendente;
  if (convite) redirect(`/convite?code=${encodeURIComponent(convite)}`);

  redirect(destino);
}

/** Criar conta; opcionalmente já levando um código de convite. */
export async function cadastroAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const lido = esquemaCadastro.safeParse({
    nome: campoTexto(formData, "nome"),
    email: campoTexto(formData, "email"),
    senha: campoTexto(formData, "senha", "password"),
    codigoConvite: campoTexto(formData, "codigoConvite"),
  });
  if (!lido.success) return { erro: primeiraMensagem(lido.error) };
  const { nome, email, senha } = lido.data;
  const codigoConvite = codigoConviteValido(lido.data.codigoConvite);
  if (lido.data.codigoConvite && !codigoConvite) {
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

  // E-mail já cadastrado recebe a MESMA resposta de um cadastro novo que
  // aguarda confirmação: a tela não revela quais e-mails têm conta.
  if (error) {
    if (erroEmailJaCadastrado(error.message)) return { aviso: mensagemCadastroNeutra(Boolean(codigoConvite)) };
    return { erro: traduzErroSupabase(error.message) };
  }
  if (!data.session) return { aviso: mensagemCadastroNeutra(Boolean(codigoConvite)) };

  // Sessão já aberta (confirmação de e-mail desligada no projeto).
  if (codigoConvite) {
    await supabase.auth.updateUser({ data: { convite_pendente: null } });
    redirect(`/convite?code=${encodeURIComponent(codigoConvite)}`);
  }
  redirect("/dashboard");
}

/** Encerra a sessão (revoga o refresh token no Supabase) e volta ao início. */
export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/");
}

export interface InfoConvite {
  valido: boolean;
  mensagem: string;
  nomeEspaco?: string;
  nomeConvidante?: string;
  /** false quando a RPC ainda não existe (migration pendente). */
  detalhado: boolean;
}

/**
 * Dados públicos do convite para a tela de confirmação (quem convidou e o
 * nome do espaço), via RPC `obter_convite` — sem expor a tabela.
 */
export async function obterConvite(codigoBruto: string): Promise<InfoConvite> {
  const codigo = codigoConviteValido(codigoBruto);
  if (!codigo) return { valido: false, mensagem: "Convite inválido.", detalhado: true };

  const auth = await obterSessao();
  if (!auth.ok) return { valido: false, mensagem: auth.mensagem, detalhado: true };

  const rpc = await auth.sessao.supabase.rpc("obter_convite", { p_codigo: codigo });
  if (rpc.error) {
    if (funcaoRpcAusente(rpc.error)) {
      return { valido: true, mensagem: "", detalhado: false };
    }
    console.error("[convites] falha ao consultar convite:", rpc.error.message);
    return { valido: false, mensagem: "Não foi possível consultar o convite agora.", detalhado: true };
  }
  const linha = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as
    | { valido?: boolean; mensagem?: string; nome_espaco?: string; nome_convidante?: string }
    | null;
  return {
    valido: Boolean(linha?.valido),
    mensagem: String(linha?.mensagem ?? ""),
    nomeEspaco: linha?.nome_espaco ?? undefined,
    nomeConvidante: linha?.nome_convidante ?? undefined,
    detalhado: true,
  };
}

/** Aceite confirmado na tela /convite (formulário POST com o código). */
export async function aceitarConviteAction(
  _prev: { erro?: string } | void,
  formData: FormData
): Promise<{ erro?: string } | void> {
  const resultado = await aceitarConvitePorCodigo(String(formData.get("codigo") ?? ""));
  if (!resultado.ok) return { erro: resultado.mensagem };
  redirect("/dashboard");
}

/**
 * Vincula o usuário logado ao workspace de um convite (por código).
 * Exige sessão verificada (getClaims). A RPC `aceitar_convite` valida o
 * status, a validade, o limite de 2 pessoas e o e-mail convidado.
 */
export async function aceitarConvitePorCodigo(
  codigoBruto: string
): Promise<{ ok: boolean; mensagem: string }> {
  const codigo = codigoConviteValido(codigoBruto);
  if (!codigo) return { ok: false, mensagem: "Convite inválido." };

  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, mensagem: auth.mensagem };
  const { supabase, userId } = auth.sessao;

  // Caminho seguro: RPC `aceitar_convite` (migration de endurecimento), que
  // valida e grava sem expor a tabela de convites.
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

  // Caminho antigo, só enquanto a RPC não existe no banco (migration ainda
  // não aplicada). Depois do SQL, nunca é usado; remover na limpeza seguinte.
  const { data: convite } = await supabase
    .from("convites")
    .select("id, workspace_id, status")
    .eq("codigo", codigo)
    .maybeSingle();

  if (!convite) return { ok: false, mensagem: "Convite inválido." };
  if (convite.status !== "pendente") {
    return {
      ok: false,
      mensagem: convite.status === "revogado" ? "Este convite foi revogado." : "Este convite já foi utilizado.",
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

/** Converte mensagens comuns do Supabase para PT-BR (sem revelar contas). */
function traduzErroSupabase(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (m.includes("weak") || m.includes("pwned") || m.includes("leaked")) {
    return "Esta senha é fraca ou já apareceu em vazamentos. Escolha outra.";
  }
  if (m.includes("password")) return "Senha inválida (mínimo de 8 caracteres, com letra e número).";
  return "Não foi possível concluir. Tente novamente.";
}
