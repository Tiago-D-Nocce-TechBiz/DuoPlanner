import "server-only";
import { criarEnviador, type MensagemEmail, type ResultadoEnvio } from "@/lib/email/enviar-nucleo";

/**
 * Envio de e-mails transacionais (Resend). Variáveis:
 *  - RESEND_API_KEY: sem ela, nada é enviado e o log registra o que sairia;
 *  - EMAIL_REMETENTE: "Nome <endereco@dominio>" de um domínio verificado na
 *    Resend. O padrão (onboarding@resend.dev) só entrega para o e-mail da
 *    própria conta da Resend: serve para testar, não para produção.
 *
 * As variáveis são lidas a cada envio (sem estado no módulo).
 */

export type { MensagemEmail, ResultadoEnvio } from "@/lib/email/enviar-nucleo";

export const REMETENTE_PADRAO = "DuoPlanner <onboarding@resend.dev>";

export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function enviarEmail(msg: MensagemEmail): Promise<ResultadoEnvio> {
  const enviar = criarEnviador({
    apiKey: process.env.RESEND_API_KEY,
    remetente: process.env.EMAIL_REMETENTE?.trim() || REMETENTE_PADRAO,
  });
  return enviar(msg);
}
