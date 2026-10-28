import { getSupabase } from "./client";

/**
 * Persistência das buscas feitas pelos motores de pesquisa.
 *
 * Tabela `viagens` (ver supabase/schema.sql) guarda tanto buscas de voos
 * quanto de hospedagens, distinguidas pela coluna `tipo`. O payload completo
 * da busca fica em `dados` (jsonb), o que mantém o schema flexível enquanto a
 * modelagem evolui.
 */

export type SearchKind = "voo" | "hospedagem";

export interface SaveSearchResult {
  ok: boolean;
  message: string;
}

export async function saveSearch(
  tipo: SearchKind,
  dados: Record<string, unknown>
): Promise<SaveSearchResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: false,
      message: "Supabase não configurado — busca gerada sem salvar.",
    };
  }

  const { error } = await supabase.from("viagens").insert({
    tipo,
    origem: (dados.originCity as string) ?? null,
    destino: (dados.destinationCity as string) ?? (dados.city as string) ?? null,
    dados,
  });

  if (error) {
    return { ok: false, message: `Não foi possível salvar: ${error.message}` };
  }
  return { ok: true, message: "Busca salva no histórico." };
}
