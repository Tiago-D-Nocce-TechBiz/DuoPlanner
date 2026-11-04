"use server";

import { AiNotConfiguredError, isGeminiConfigured } from "@/lib/ai/model";
import { runReceiptAgent } from "@/lib/ai/receipt-agent";
import type { PropostaRecibo } from "@/lib/finance/recibo";
import { parseBase64Upload } from "@/lib/ai/upload";
import { obterSessao } from "@/lib/auth/sessao";
import { todayInSaoPaulo } from "@/lib/dates";
import { consumirCota } from "@/lib/seguranca/cotas";

/**
 * Finanças Duo — leitura de recibos e comprovantes Pix com IA (Gemini Vision).
 *
 * Fluxo: sessão (getClaims) → valida o arquivo → cota "ia" do usuário →
 * agente LangGraph extrai { titulo, estabelecimento, valor, data, moeda,
 * categoria } → devolve uma PROPOSTA. Nada é gravado aqui: o usuário revisa
 * e confirma na tela, e só então o gasto entra na fila de sincronização.
 *
 * Antes, esta action gravava direto em `despesas` e funcionava sem login
 * (user_id nulo), porque Server Actions aceitam POST em qualquer rota.
 *
 * Nunca lança para o cliente: devolve sempre um resultado com mensagem em PT-BR.
 */

export type ReceiptScanResult =
  | { ok: true; proposta: PropostaRecibo; avisos: string[] }
  | { ok: false; message: string };

export async function processReceiptImage(base64Image: string): Promise<ReceiptScanResult> {
  const auth = await obterSessao();
  if (!auth.ok) return { ok: false, message: auth.mensagem };

  const upload = parseBase64Upload(base64Image);
  if (!upload.ok) return upload;

  if (!isGeminiConfigured()) {
    return { ok: false, message: new AiNotConfiguredError().message };
  }

  const cota = await consumirCota(auth.sessao.supabase, auth.sessao.userId, "ia");
  if (!cota.permitido) return { ok: false, message: cota.mensagem };

  try {
    const state = await runReceiptAgent({
      mimeType: upload.mimeType,
      base64: upload.base64,
      hoje: todayInSaoPaulo(),
    });
    if (state.erro || !state.proposta) {
      return { ok: false, message: state.erro ?? "Não foi possível ler o comprovante." };
    }
    return { ok: true, proposta: state.proposta, avisos: state.avisos };
  } catch (error) {
    console.error("[processReceiptImage]", error);
    return {
      ok: false,
      message: "A IA não conseguiu processar o comprovante agora. Tente novamente em instantes.",
    };
  }
}
