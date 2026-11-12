"use server";

import { z } from "zod";
import { ErroAcao, withAuthAction } from "@/lib/acoes/com-sessao";
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

const esquemaBusca = z.object({
  tipo: z.enum(["voo", "hospedagem"], { error: "Tipo de busca inválido." }),
  dados: esquemaDados,
});

export const saveSearch = withAuthAction("saveSearch", esquemaBusca, async ({ tipo, dados }, { sessao }): Promise<null> => {
  const limpo = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined));
  const workspace = await getWorkspaceAtual();

  const { error } = await sessao.supabase.from("viagens").insert({
    user_id: sessao.userId,
    workspace_id: workspace?.id ?? null,
    tipo,
    origem: dados.originCity ?? null,
    destino: dados.destinationCity ?? dados.city ?? null,
    dados: limpo,
  });
  if (error) {
    console.error("[viagens] falha ao salvar busca:", error.message);
    throw new ErroAcao("INDISPONIVEL", "Não foi possível salvar a busca no histórico.");
  }
  return null;
});
