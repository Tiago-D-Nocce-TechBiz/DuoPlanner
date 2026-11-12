"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ErroAcao, withAuthAction } from "@/lib/acoes/com-sessao";
import { SITE_URL } from "@/lib/auth/seguranca";
import { emailConvite } from "@/lib/email/templates";
import { enviarEmail } from "@/lib/mail";
import { consumirCota } from "@/lib/seguranca/cotas";
import { getWorkspaceAtual } from "@/lib/supabase/workspace";

/**
 * Convite para o espaço do casal (Server Action).
 *
 * Cria um convite real no banco para o workspace do usuário logado e devolve
 * o código + o link pronto. Com e-mail informado, o convite só vale para
 * aquele endereço e segue por e-mail (Resend). Limite: cota "convite" (10 por
 * dia), porque cada convite pode disparar um e-mail.
 */

export interface ConviteGerado {
  codigo: string;
  link: string;
  /** Com e-mail informado: o convite saiu por e-mail? */
  emailEnviado?: boolean;
  mensagem: string;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const VALIDADE_DIAS = 7;

const esquemaEmailConvidado = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || (v.length <= 254 && EMAIL.test(v)), "Confira o e-mail da pessoa convidada (ou deixe em branco).")
  .optional();

/** Gera um link de convite (convite real, salvo na tabela `convites`). */
export const gerarConvite = withAuthAction(
  "gerarConvite",
  esquemaEmailConvidado,
  async (emailInformado, { sessao }): Promise<ConviteGerado> => {
    const { supabase, userId } = sessao;
    const email = emailInformado ?? "";
    if (email && sessao.email && email === sessao.email.toLowerCase()) {
      throw new ErroAcao("ENTRADA_INVALIDA", "Informe o e-mail da outra pessoa (este é o seu).");
    }

    const ws = await getWorkspaceAtual();
    if (!ws) throw new ErroAcao("INDISPONIVEL", "Não foi possível preparar o espaço da dupla. Tente de novo em instantes.");

    const cota = await consumirCota(supabase, userId, "convite");
    if (!cota.permitido) throw new ErroAcao("COTA_EXCEDIDA", cota.mensagem);

    const { data, error } = await supabase
      .from("convites")
      .insert({ workspace_id: ws.id, email_convidado: email || null, convidado_por: userId })
      .select("codigo")
      .single();
    if (error || !data) {
      if (error) console.error("[convites] falha ao criar convite:", error.message);
      throw new ErroAcao("INDISPONIVEL", "Não foi possível criar o convite agora. Tente de novo em instantes.");
    }

    const codigo = String(data.codigo);
    const link = `${SITE_URL}/convite?code=${encodeURIComponent(codigo)}`;
    if (!email) {
      return {
        codigo,
        link,
        mensagem: `Convite criado! Compartilhe o link com seu parceiro(a). Ele vale por ${VALIDADE_DIAS} dias.`,
      };
    }

    const emailEnviado = await enviarConvitePorEmail({
      supabase,
      userId,
      emailProprio: sessao.email,
      para: email,
      nomeEspaco: ws.nome,
      codigo,
      link,
    });
    return {
      codigo,
      link,
      emailEnviado,
      mensagem: emailEnviado
        ? `Convite enviado para ${email}. Ele vale por ${VALIDADE_DIAS} dias e só pode ser aceito com este e-mail; se preferir, copie o link abaixo.`
        : `Convite criado, mas o e-mail não pôde ser enviado agora. Copie o link abaixo e mande para ${email}: ele vale por ${VALIDADE_DIAS} dias e só pode ser aceito com este e-mail.`,
    };
  }
);

async function enviarConvitePorEmail(p: {
  supabase: SupabaseClient;
  userId: string;
  emailProprio: string | null;
  para: string;
  nomeEspaco: string;
  codigo: string;
  link: string;
}): Promise<boolean> {
  try {
    // Nome de quem convida: o do perfil (o par vê o mesmo nome no painel).
    const { data: perfil } = await p.supabase.from("perfis").select("nome").eq("user_id", p.userId).maybeSingle();
    const nome =
      (typeof perfil?.nome === "string" && perfil.nome.trim()) || (p.emailProprio ? p.emailProprio.split("@")[0] : "");
    const montado = emailConvite({ nomeConvidante: nome, nomeEspaco: p.nomeEspaco, link: p.link, validadeDias: VALIDADE_DIAS });
    const envio = await enviarEmail({
      para: p.para,
      assunto: montado.assunto,
      html: montado.html,
      texto: montado.texto,
      idempotencia: `convite-${p.codigo}`,
      categoria: "convite",
    });
    return envio.ok;
  } catch (erro) {
    console.error("[convites] falha ao enviar o e-mail do convite:", erro instanceof Error ? erro.message : erro);
    return false;
  }
}
