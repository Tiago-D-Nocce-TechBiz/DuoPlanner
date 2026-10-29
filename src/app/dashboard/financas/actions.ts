"use server";

import { refresh } from "next/cache";
import { AiNotConfiguredError, isGeminiConfigured } from "@/lib/ai/model";
import { runReceiptAgent, type ExtractedExpense } from "@/lib/ai/receipt-agent";
import { parseBase64Upload } from "@/lib/ai/upload";
import { todayInSaoPaulo } from "@/lib/dates";
import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";

/**
 * Finanças Duo — OCR de notas fiscais e recibos com IA.
 *
 * Fluxo: valida o arquivo → Agente de Leitura de Recibos (LangGraph + Gemini
 * Vision) extrai { titulo, valor, data } → a despesa é inserida em
 * `despesas` no Supabase → a página é atualizada com refresh().
 *
 * Nunca lança para o cliente: devolve sempre um resultado com mensagem em PT-BR.
 */

export type ReceiptScanResult =
  | {
      ok: true;
      despesa: ExtractedExpense;
      salvo: boolean;
      avisos: string[];
      message: string;
    }
  | { ok: false; message: string };

export async function processReceiptImage(
  base64Image: string
): Promise<ReceiptScanResult> {
  const upload = parseBase64Upload(base64Image);
  if (!upload.ok) return upload;

  if (!isGeminiConfigured()) {
    return { ok: false, message: new AiNotConfiguredError().message };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const userId = supabase ? await getCurrentUserId(supabase) : null;

    const state = await runReceiptAgent(
      { mimeType: upload.mimeType, base64: upload.base64, hoje: todayInSaoPaulo() },
      { supabase, userId }
    );

    if (state.erro || !state.despesa) {
      return { ok: false, message: state.erro ?? "Não foi possível ler o recibo." };
    }

    const salvo = Boolean(state.despesaId);
    if (salvo) refresh();

    return {
      ok: true,
      despesa: state.despesa,
      salvo,
      avisos: state.avisos,
      message: salvo
        ? "Despesa registrada nas Finanças Duo."
        : "Recibo lido, mas a despesa não foi salva.",
    };
  } catch (error) {
    console.error("[processReceiptImage]", error);
    return {
      ok: false,
      message: "A IA não conseguiu processar o recibo agora. Tente novamente em instantes.",
    };
  }
}
