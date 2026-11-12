"use server";

import { z } from "zod";
import { ErroAcao, withAuthAction } from "@/lib/acoes/com-sessao";
import { AiNotConfiguredError } from "@/lib/ai/model";
import { runReceiptAgent } from "@/lib/ai/receipt-agent";
import { parseBase64Upload } from "@/lib/ai/upload";
import { todayInSaoPaulo } from "@/lib/dates";
import { integracaoAtiva } from "@/lib/env";
import type { PropostaRecibo } from "@/lib/finance/recibo";
import { consumirCota } from "@/lib/seguranca/cotas";

/**
 * DuoFinance — leitura de recibos e comprovantes Pix com IA (Gemini Vision).
 *
 * Fluxo: sessão (getClaims) → valida o arquivo → cota "ia" do usuário →
 * agente LangGraph extrai { titulo, estabelecimento, valor, data, moeda,
 * categoria } → devolve uma PROPOSTA. Nada é gravado aqui: o usuário revisa
 * e confirma na tela, e só então o gasto entra na fila de sincronização.
 */

export interface LeituraRecibo {
  proposta: PropostaRecibo;
  avisos: string[];
}

export const processReceiptImage = withAuthAction(
  "processReceiptImage",
  z.string({ error: "Envie a imagem do comprovante." }),
  async (base64Image, { sessao }): Promise<LeituraRecibo> => {
    const upload = parseBase64Upload(base64Image);
    if (!upload.ok) throw new ErroAcao("ENTRADA_INVALIDA", upload.message);
    if (!integracaoAtiva("ia")) throw new ErroAcao("NAO_CONFIGURADO", new AiNotConfiguredError().message);

    const cota = await consumirCota(sessao.supabase, sessao.userId, "ia");
    if (!cota.permitido) throw new ErroAcao("COTA_EXCEDIDA", cota.mensagem);

    let state: Awaited<ReturnType<typeof runReceiptAgent>>;
    try {
      state = await runReceiptAgent({ mimeType: upload.mimeType, base64: upload.base64, hoje: todayInSaoPaulo() });
    } catch (error) {
      console.error("[processReceiptImage]", error);
      throw new ErroAcao("INDISPONIVEL", "A IA não conseguiu processar o comprovante agora. Tente novamente em instantes.");
    }
    if (state.erro || !state.proposta) {
      throw new ErroAcao("ENTRADA_INVALIDA", state.erro ?? "Não foi possível ler o comprovante.");
    }
    return { proposta: state.proposta, avisos: state.avisos };
  }
);
