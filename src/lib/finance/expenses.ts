import "server-only";
import { cache } from "react";
import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";

/**
 * Leitura das despesas (tabela `despesas`) para a tela Finanças Duo.
 * `cache` do React deduplica a consulta entre o resumo e a lista na mesma
 * requisição. Leitura sem `use cache`: depende dos cookies da sessão e precisa
 * refletir na hora o que o OCR acabou de inserir.
 */

export interface Expense {
  id: string;
  titulo: string;
  valor: number;
  moeda: string;
  data: string | null;
  origem: "ocr" | "manual";
}

export interface ExpensesResult {
  configured: boolean;
  items: Expense[];
  error?: string;
}

export const getExpenses = cache(async (): Promise<ExpensesResult> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { configured: false, items: [] };

  const userId = await getCurrentUserId(supabase);
  const query = supabase
    .from("despesas")
    .select("id, titulo, estabelecimento, valor, moeda, data, origem, created_at")
    .order("data", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const { data, error } = await (userId
    ? query.eq("user_id", userId)
    : query.is("user_id", null));
  if (error) return { configured: true, items: [], error: error.message };

  return {
    configured: true,
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      titulo: String(row.titulo || row.estabelecimento || "Despesa"),
      valor: Number(row.valor) || 0,
      moeda: typeof row.moeda === "string" && row.moeda ? row.moeda : "BRL",
      data: typeof row.data === "string" ? row.data : null,
      origem: row.origem === "ocr" ? "ocr" : "manual",
    })),
  };
});

export interface ExpensesSummary {
  totalBrl: number;
  perPerson: number;
  count: number;
  viaIa: number;
  otherCurrencies: { currency: string; total: number }[];
}

/** Totais por moeda (sem conversão cambial) e divisão igual para a dupla. */
export function summarizeExpenses(items: Expense[]): ExpensesSummary {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.moeda, (totals.get(item.moeda) ?? 0) + item.valor);
  }
  const totalBrl = totals.get("BRL") ?? 0;
  return {
    totalBrl,
    perPerson: totalBrl / 2,
    count: items.length,
    viaIa: items.filter((item) => item.origem === "ocr").length,
    otherCurrencies: [...totals]
      .filter(([currency]) => currency !== "BRL")
      .map(([currency, total]) => ({ currency, total })),
  };
}
