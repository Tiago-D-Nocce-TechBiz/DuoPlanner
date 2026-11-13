/**
 * Envio de e-mail pela API HTTP da Resend, sem SDK (núcleo puro: `fetch` e
 * espera injetáveis nos testes). `src/lib/mail.ts` liga as variáveis de
 * ambiente.
 *
 * - Sem RESEND_API_KEY: não envia, registra no log (destinatário mascarado) e
 *   devolve `nao_configurado`; quem chama segue sem quebrar.
 * - Idempotency-Key: a Resend descarta repetições da mesma chave por 24 h, o
 *   que torna seguro reenviar depois de uma queda de rede ou de um 5xx.
 * - 429 por excesso de requisições (padrão: 10 por segundo): espera o
 *   Retry-After (até 2 s) e tenta uma vez. Cota diária/mensal estourada não
 *   adianta repetir.
 * - Prazo de 8 s por tentativa (`fetchWithTimeout`): a Resend fora do ar não
 *   prende a tarefa agendada nem o convite.
 */
import { fetchWithTimeout } from "../http/fetch-com-limite";

export const URL_RESEND = "https://api.resend.com/emails";

export interface MensagemEmail {
  para: string;
  assunto: string;
  html: string;
  texto: string;
  /** Chave de idempotência (até 256 caracteres): mesma chave, mesmo e-mail. */
  idempotencia?: string;
  /** Marca para os relatórios da Resend (letras, números, _ e -). */
  categoria?: string;
}

export type ResultadoEnvio =
  | { ok: true; id: string | null; repetido: boolean }
  | {
      ok: false;
      motivo: "nao_configurado" | "destinatario_invalido" | "limite" | "rejeitado" | "falha";
      mensagem: string;
    };

export interface ConfigEnvio {
  apiKey: string | undefined;
  remetente: string;
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  registrar?: Pick<Console, "info" | "warn" | "error">;
}

const EMAIL = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,253}\.[^\s@<>()",;:.]{2,}$/;

/** "ana.silva@gmail.com" → "an***@gmail.com" (para logs). */
export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return "***";
  return `${usuario.slice(0, 2)}***@${dominio}`;
}

const esperarPadrao = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

export function criarEnviador(config: ConfigEnvio) {
  const fazerFetch = config.fetch ?? fetch;
  const esperar = config.esperar ?? esperarPadrao;
  const log = config.registrar ?? console;

  return async function enviar(msg: MensagemEmail): Promise<ResultadoEnvio> {
    const para = msg.para.trim().toLowerCase();
    if (para.length > 254 || !EMAIL.test(para)) {
      return { ok: false, motivo: "destinatario_invalido", mensagem: "Endereço de e-mail inválido." };
    }
    if (!config.apiKey) {
      log.info(`[mail] RESEND_API_KEY ausente: "${msg.assunto}" para ${mascararEmail(para)} não foi enviado.`);
      return { ok: false, motivo: "nao_configurado", mensagem: "O envio de e-mails não está configurado." };
    }

    const corpo = JSON.stringify({
      from: config.remetente,
      to: [para],
      subject: msg.assunto,
      html: msg.html,
      text: msg.texto,
      ...(msg.categoria ? { tags: [{ name: "categoria", value: msg.categoria.replace(/[^A-Za-z0-9_-]/g, "_") }] } : {}),
    });
    const cabecalhos: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    };
    if (msg.idempotencia) cabecalhos["Idempotency-Key"] = msg.idempotencia.slice(0, 256);

    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const ultima = tentativa === 2;
      let resposta: Response;
      try {
        resposta = await fetchWithTimeout(URL_RESEND, { method: "POST", headers: cabecalhos, body: corpo }, fazerFetch);
      } catch (erro) {
        // Sem chave de idempotência, repetir poderia mandar o e-mail duas vezes.
        if (!ultima && msg.idempotencia) {
          await esperar(500);
          continue;
        }
        log.error(`[mail] falha de rede ao enviar "${msg.assunto}":`, erro instanceof Error ? erro.message : erro);
        return { ok: false, motivo: "falha", mensagem: "Não foi possível falar com o serviço de e-mail." };
      }

      const dados = (await resposta.json().catch(() => null)) as { id?: unknown; name?: unknown; message?: unknown } | null;
      if (resposta.ok) {
        return { ok: true, id: typeof dados?.id === "string" ? dados.id : null, repetido: false };
      }
      const nome = typeof dados?.name === "string" ? dados.name : "";
      const detalhe = typeof dados?.message === "string" ? dados.message : "";

      if (resposta.status === 409) {
        // A mesma chave ainda está em processamento: aguarda e confere de novo.
        if (!ultima && /concurrent/.test(nome)) {
          await esperar(1000);
          continue;
        }
        // A chave já foi usada: este e-mail já saiu antes (não reenviamos).
        log.warn(`[mail] "${msg.assunto}" já tinha sido enviado (chave de idempotência repetida).`);
        return { ok: true, id: null, repetido: true };
      }
      if (resposta.status === 429) {
        if (!ultima && nome !== "daily_quota_exceeded" && nome !== "monthly_quota_exceeded") {
          const segundos = Number(resposta.headers.get("retry-after"));
          await esperar(Math.min(2, Number.isFinite(segundos) && segundos > 0 ? segundos : 1) * 1000);
          continue;
        }
        log.warn(`[mail] limite da Resend (${nome || "429"}): "${msg.assunto}" não foi enviado.`);
        return { ok: false, motivo: "limite", mensagem: "O limite de envio de e-mails foi atingido." };
      }
      if (resposta.status >= 500 && !ultima && msg.idempotencia) {
        await esperar(500);
        continue;
      }
      log.error(`[mail] a Resend recusou "${msg.assunto}" (${resposta.status} ${nome}): ${detalhe}`);
      return {
        ok: false,
        motivo: resposta.status >= 500 ? "falha" : "rejeitado",
        mensagem: "O serviço de e-mail recusou o envio.",
      };
    }
    return { ok: false, motivo: "falha", mensagem: "Não foi possível falar com o serviço de e-mail." };
  };
}
