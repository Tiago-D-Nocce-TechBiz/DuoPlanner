"use server";

/**
 * Finanças Duo — Server Action BASE para digitalização de recibos com IA.
 *
 * ESTADO: placeholder/estrutura. A ligação ao LLM de visão (OCR de
 * faturas/recibos) e a persistência em base de dados serão adicionadas aqui.
 *
 * Contrato pretendido (para evolução futura):
 *  1. Receber o ficheiro do recibo (imagem/PDF) via FormData.
 *  2. Enviar para um LLM de visão e extrair: comerciante, data, total, moeda,
 *     categoria e itens.
 *  3. Persistir a despesa associada à dupla/viagem na base de dados.
 *  4. Revalidar a página de finanças para refletir a nova despesa.
 */

export interface ScannedReceipt {
  merchant: string;
  date: string; // ISO yyyy-mm-dd
  total: number;
  currency: string;
  category: string;
}

export interface ScanResult {
  ok: boolean;
  message: string;
  receipt?: ScannedReceipt;
}

export async function scanReceiptAction(
  formData: FormData
): Promise<ScanResult> {
  const file = formData.get("receipt");

  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      message: "Selecione uma imagem ou PDF do recibo para digitalizar.",
    };
  }

  // TODO (integração futura):
  // 1. const bytes = await file.arrayBuffer();
  // 2. const extracted = await visionLLM.extractReceipt(bytes);
  // 3. await db.expenses.insert({ ...extracted, duoId, tripId });
  // 4. revalidatePath("/dashboard/financas");

  // Placeholder: confirma a receção do ficheiro sem persistir.
  return {
    ok: true,
    message: `Recibo "${file.name}" recebido. A extração por IA será ativada em breve.`,
  };
}
