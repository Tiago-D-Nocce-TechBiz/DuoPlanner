import "server-only";
import { criarEnviador, type MensagemEmail, type ResultadoEnvio } from "@/lib/email/enviar-nucleo";
import { ambiente } from "@/lib/env";

/**
 * Envio de e-mails transacionais (Resend), com a configuração validada em
 * @/lib/env:
 *  - RESEND_API_KEY: sem ela, nada é enviado e o log registra o que sairia;
 *  - EMAIL_REMETENTE: "Nome <endereco@dominio>" de um domínio verificado na
 *    Resend. O padrão (onboarding@resend.dev) só entrega para o e-mail da
 *    própria conta da Resend: serve para testar, não para produção.
 */

export type { MensagemEmail, ResultadoEnvio } from "@/lib/email/enviar-nucleo";

export const REMETENTE_PADRAO = "DuoPlanner <onboarding@resend.dev>";

export async function enviarEmail(msg: MensagemEmail): Promise<ResultadoEnvio> {
  const email = ambiente().email;
  const enviar = criarEnviador({
    apiKey: email?.apiKey,
    remetente: email?.remetente || REMETENTE_PADRAO,
  });
  return enviar(msg);
}
