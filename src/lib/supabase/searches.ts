"use server";

import { z } from "zod";
import { obterSessao } from "@/lib/auth/sessao";
import { getWorkspaceAtual } from "./workspace";

/**
 * Histórico de buscas (Server Action).
 *
 * Grava pelo servidor, com `user_id` e `workspace_id` da sessão: antes o
 * browser inseria anonimamente (sem dono), o que deixava a linha legível para
 * qualquer um enquanto as políticas de desenvolvimento aceitavam
 * `user_id is null`. Sem sessão verificada (getClaims), não grava.
 *
 * Tabela `viagens` (ver supabase/migrations): voos e hospedagens, separados
 * pela coluna `tipo`; o payload validado fica em `dados` (jsonb).
 */

export type SearchKind = "voo" | "hospedagem";

export interface SaveSearchResult {
  ok: boolean;
  message: string;
}

// Campo inválido é descartado (não derruba o registro inteiro).
const texto = z.string().trim().min(1).max(120).optional().catch(undefined);
const iata = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((s) => s.toUpperCase())
  .optional()
  .catch(undefined);
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);
const quantidade = z.number().int().min(1).max(20).optional().catch(undefined);
const noites = z.number().int().min(0).max(90);

const esquemaDados = z.object({
  modal: z.enum(["onibus"]).optional().catch(undefined),
  originCity: texto,
  destinationCity: texto,
  city: texto,
  originIata: iata,
  destinationIata: iata,
  departDate: dataIso,
  departDateTo: dataIso,
  returnDate: dataIso,
  checkin: dataIso,
  checkout: dataIso,
  tripType: z.enum(["round", "oneway"]).optional().catch(undefined),
  nights: z.tuple([noites, noites]).nullable().optional().catch(undefined),
  passengers: quantidade,
  guests: quantidade,
  rooms: quantidade,
  cabin: z.enum(["economy", "premium", "business", "first"]).optional().catch(undefined),
});

export async function saveSearch(tipo: SearchKind, dados: Record<string, unknown>): Promise<SaveSearchResult> {
  if (tipo !== "voo" && tipo !== "hospedagem") {
    return { ok: false, message: "Tipo de busca inválido." };
  }
  const auth = await obterSessao();
  if (!auth.ok) {
    return {
      ok: false,
      message:
        auth.motivo === "nao_configurado"
          ? "Supabase não configurado — busca gerada sem salvar."
          : "Entre na sua conta para salvar o histórico de buscas.",
    };
  }
  const { supabase, userId } = auth.sessao;
  const lido = esquemaDados.safeParse(dados ?? {});
  if (!lido.success) {
    return { ok: false, message: "Dados de busca inválidos." };
  }
  const limpo = Object.fromEntries(Object.entries(lido.data).filter(([, v]) => v !== undefined));
  const workspace = await getWorkspaceAtual();

  const { error } = await supabase.from("viagens").insert({
    user_id: userId,
    workspace_id: workspace?.id ?? null,
    tipo,
    origem: lido.data.originCity ?? null,
    destino: lido.data.destinationCity ?? lido.data.city ?? null,
    dados: limpo,
  });
  if (error) {
    console.error("[viagens] falha ao salvar busca:", error.message);
    return { ok: false, message: "Não foi possível salvar a busca no histórico." };
  }
  return { ok: true, message: "Busca salva no histórico." };
}
