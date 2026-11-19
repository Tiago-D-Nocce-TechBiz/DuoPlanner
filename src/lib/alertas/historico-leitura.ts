import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tabelaAusente } from "@/lib/auth/seguranca";
import { normalizarPontos, type PontoPreco } from "./historico";

/** Quantos dias de histórico a tela mostra (o mais recente primeiro na consulta). */
export const DIAS_DE_HISTORICO = 180;

/**
 * Lê a série de preços de um alerta, com colunas explícitas. A RLS da tabela
 * só entrega o que é do espaço da pessoa: um alerta de outro casal volta
 * vazio. "indisponivel" = banco sem a migration do histórico.
 */
export async function lerHistoricoDoAlerta(supabase: SupabaseClient, alertaId: string): Promise<PontoPreco[] | "indisponivel"> {
  const { data, error } = await supabase
    .from("alertas_preco_historico")
    .select("dia, preco")
    .eq("alerta_id", alertaId)
    .order("dia", { ascending: false })
    .limit(DIAS_DE_HISTORICO);
  if (error) {
    if (tabelaAusente(error)) return "indisponivel";
    throw new Error(`histórico de preços: ${error.message}`);
  }
  return normalizarPontos(((data ?? []) as { dia: unknown; preco: unknown }[]).map((l) => ({ dia: String(l.dia).slice(0, 10), preco: Number(l.preco) })));
}
