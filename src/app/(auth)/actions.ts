"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ErroAcao, withAuthFormAction, withPublicAction, withPublicFormAction, type ContextoAcao } from "@/lib/acoes/com-sessao";
import { codigoConviteValido, destinoSeguro, funcaoRpcAusente, SITE_URL } from "@/lib/auth/seguranca";
import { erroEmailJaCadastrado, esquemaCadastro, esquemaLogin, mensagemCadastroNeutra } from "@/lib/auth/validacao";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Autenticação real via Supabase Auth (e-mail/senha) + pareamento de contas.
 *
 * Todas devolvem `ResultadoAcao` (`@/lib/acoes/resultado`) ou redirecionam no
 * sucesso. Entradas validadas com zod (`@/lib/auth/validacao`). Quando o
 * Supabase não está configurado, caímos num modo de demonstração que apenas
 * navega para o painel (sem sessão real; em produção o proxy bloqueia).
 *
 * Convite: o código digitado no cadastro fica guardado na conta
 * (`user_metadata.convite_pendente`) e, no primeiro login, a pessoa vai para
 * /convite, onde CONFIRMA o aceite (POST). Antes, abrir o link já aceitava:
 * um link malicioso colocava a vítima no espaço de outra pessoa sem aviso.
 */

/** Entrar com e-mail e senha. Sucesso sempre redireciona. */
export const loginAction = withPublicFormAction("login", esquemaLogin, async (dados): Promise<never> => {
  const destino = destinoSeguro(dados.redirect);
  const conviteDoForm = codigoConviteValido(dados.codigoConvite);

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(destino); // modo demonstração: sem Supabase, apenas navega

  const { data, error } = await supabase.auth.signInWithPassword({ email: dados.email, password: dados.senha });
  if (error) throw erroDoSupabase(error.message);

  // Convite do link (?convite=) ou guardado no cadastro: a página /convite
  // mostra quem convidou e pede a confirmação.
  const pendente = codigoConviteValido(
    String((data.user?.user_metadata as { convite_pendente?: unknown } | undefined)?.convite_pendente ?? "")
  );
  if (pendente) await supabase.auth.updateUser({ data: { convite_pendente: null } });
  const convite = conviteDoForm ?? pendente;
  if (convite) redirect(`/convite?code=${encodeURIComponent(convite)}`);
  redirect(destino);
});

/**
 * Criar conta; opcionalmente já levando um código de convite. Sem sessão
 * aberta (confirmação de e-mail ligada), devolve o aviso neutro.
 */
export const cadastroAction = withPublicFormAction("cadastro", esquemaCadastro, async (dados): Promise<{ aviso: string }> => {
  const codigoConvite = codigoConviteValido(dados.codigoConvite);
  if (dados.codigoConvite && !codigoConvite) {
    throw new ErroAcao("ENTRADA_INVALIDA", "Código de convite inválido. Confira o link recebido ou deixe o campo em branco.");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/dashboard");

  // Depois de confirmar o e-mail, o link volta para /auth/callback, que abre
  // a sessão e segue para o convite (ou para o painel).
  const next = codigoConvite ? `/convite?code=${codigoConvite}` : "/dashboard";
  const { data, error } = await supabase.auth.signUp({
    email: dados.email,
    password: dados.senha,
    options: {
      data: {
        nome: dados.nome || dados.email.split("@")[0],
        ...(codigoConvite ? { convite_pendente: codigoConvite } : {}),
      },
      emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  // E-mail já cadastrado recebe a MESMA resposta de um cadastro novo que
  // aguarda confirmação: a tela não revela quais e-mails têm conta.
  if (error) {
    if (erroEmailJaCadastrado(error.message)) return { aviso: mensagemCadastroNeutra(Boolean(codigoConvite)) };
    throw erroDoSupabase(error.message);
  }
  if (!data.session) return { aviso: mensagemCadastroNeutra(Boolean(codigoConvite)) };

  // Sessão já aberta (confirmação de e-mail desligada no projeto).
  if (codigoConvite) {
    await supabase.auth.updateUser({ data: { convite_pendente: null } });
    redirect(`/convite?code=${encodeURIComponent(codigoConvite)}`);
  }
  redirect("/dashboard");
});

/** Encerra a sessão (revoga o refresh token no Supabase) e volta ao início. */
export const logoutAction = withPublicAction("logout", async (): Promise<never> => {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    // Sem revogar no servidor, quem chamou faz o signOut local e sai.
    if (error) throw new ErroAcao("INDISPONIVEL", "Não foi possível encerrar a sessão no servidor agora.");
  }
  redirect("/");
});

/** Aceite confirmado na tela /convite (formulário POST com o código). */
export const aceitarConviteAction = withAuthFormAction(
  "aceitarConvite",
  z.object({ codigo: z.string().max(80).catch("") }),
  async ({ codigo }, ctx): Promise<never> => {
    await aceitarConvitePorCodigo(codigo, ctx);
    redirect("/dashboard");
  }
);

/**
 * Vincula o usuário logado ao workspace de um convite (por código). A RPC
 * `aceitar_convite` valida o status, a validade, o limite de 2 pessoas e o
 * e-mail convidado. Não exportada: só o formulário acima a usa.
 */
async function aceitarConvitePorCodigo(codigoBruto: string, { sessao }: ContextoAcao): Promise<void> {
  const codigo = codigoConviteValido(codigoBruto);
  if (!codigo) throw new ErroAcao("ENTRADA_INVALIDA", "Convite inválido.");
  const { supabase, userId } = sessao;

  // Caminho seguro: RPC `aceitar_convite` (migration de endurecimento), que
  // valida e grava sem expor a tabela de convites.
  const rpc = await supabase.rpc("aceitar_convite", { p_codigo: codigo });
  if (!rpc.error) {
    const linha = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { ok?: boolean; mensagem?: string } | null;
    if (!linha?.ok) throw new ErroAcao("CONFLITO", String(linha?.mensagem || "Não foi possível aceitar o convite agora."));
    return;
  }
  if (!funcaoRpcAusente(rpc.error)) {
    console.error("[convites] falha na RPC aceitar_convite:", rpc.error.message);
    throw new ErroAcao("INDISPONIVEL", "Não foi possível aceitar o convite agora. Tente de novo em instantes.");
  }

  // Caminho antigo, só enquanto a RPC não existe no banco (migration ainda
  // não aplicada). Depois do SQL, nunca é usado; remover na limpeza seguinte.
  const { data: convite } = await supabase
    .from("convites")
    .select("id, workspace_id, status")
    .eq("codigo", codigo)
    .maybeSingle();

  if (!convite) throw new ErroAcao("NAO_ENCONTRADO", "Convite inválido.");
  if (convite.status !== "pendente") {
    throw new ErroAcao(
      "CONFLITO",
      convite.status === "revogado" ? "Este convite foi revogado." : "Este convite já foi utilizado."
    );
  }

  const { error: erroMembro } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: convite.workspace_id, user_id: userId, papel: "parceiro" });
  // Conflito (já é membro) não é erro para o usuário.
  if (erroMembro && !erroMembro.message.includes("duplicate")) throw erroDoSupabase(erroMembro.message);

  await supabase.from("convites").update({ status: "aceito" }).eq("id", convite.id);
}

/** Converte mensagens comuns do Supabase para PT-BR (sem revelar contas). */
function erroDoSupabase(msg: string): ErroAcao {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return new ErroAcao("NAO_AUTENTICADO", "E-mail ou senha incorretos.");
  if (m.includes("email not confirmed")) return new ErroAcao("NAO_AUTENTICADO", "Confirme seu e-mail antes de entrar.");
  if (m.includes("rate limit") || m.includes("too many")) {
    return new ErroAcao("COTA_EXCEDIDA", "Muitas tentativas. Aguarde alguns minutos.");
  }
  if (m.includes("weak") || m.includes("pwned") || m.includes("leaked")) {
    return new ErroAcao("ENTRADA_INVALIDA", "Esta senha é fraca ou já apareceu em vazamentos. Escolha outra.");
  }
  if (m.includes("password")) {
    return new ErroAcao("ENTRADA_INVALIDA", "Senha inválida (mínimo de 8 caracteres, com letra e número).");
  }
  return new ErroAcao("INDISPONIVEL", "Não foi possível concluir. Tente novamente.");
}
