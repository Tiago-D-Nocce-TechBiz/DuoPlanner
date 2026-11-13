import { NextResponse, type NextRequest } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/sessao";
import { integracaoAtiva } from "@/lib/env";
import { loadPreferencesSafe } from "@/lib/memory/store";
import { consumirCota, respostaCotaNegada } from "@/lib/seguranca/cotas";
import {
  invalidParamsResponse,
  notConfiguredResponse,
  upstreamErrorResponse,
} from "@/lib/travel/http";
import {
  applyFlightPreferences,
  parseFlightSearchParams,
  searchFlights,
} from "@/lib/travel/kiwi";
import type { FlightSearchResponse } from "@/lib/travel/types";

/**
 * GET /api/flights — motor de voos (Kiwi.com Tequila API).
 *
 * Query string:
 *   from, to            códigos IATA (ex.: GRU, LIS)
 *   dateFrom, dateTo    janela flexível da ida (AAAA-MM-DD; dateTo opcional)
 *   tripType            round | oneway (padrão: round)
 *   nightsFrom/To       noites no destino (ida e volta)
 *   adults              padrão 2 (a dupla)
 *   cabin               economy | premium | business | first
 *   maxStopovers        escalas por trecho (0 = direto)
 *   maxLayoverHours     duração máxima de cada escala
 *   budget              teto do preço total (BRL)
 *   sort                price | duration | quality (padrão: price)
 *   memory              1 | 0 — aplica as preferências memorizadas pela IA
 *
 * Exemplo: /api/flights?from=GRU&to=LIS&dateFrom=2026-12-01&dateTo=2026-12-10&nightsFrom=7&nightsTo=10
 *
 * Ordem: sessão (401) → parâmetros (400) → cota por usuário (429) → Kiwi.
 * A sessão é verificada aqui mesmo que o proxy já filtre: defesa em camadas.
 * A cota vem depois da validação para um erro de digitação não gastar o
 * limite. O cache fica na chamada à Kiwi (`fetchKiwiOffers`, 10 min).
 */
export async function GET(request: NextRequest) {
  const auth = await exigirSessaoApi();
  if (!auth.ok) return auth.resposta;
  const { supabase, userId } = auth.sessao;

  const parsed = parseFlightSearchParams(request.nextUrl.searchParams);
  if (!parsed.success) return invalidParamsResponse(parsed.error);

  if (!integracaoAtiva("voos")) {
    return notConfiguredResponse(
      "KIWI_NOT_CONFIGURED",
      "Motor de voos indisponível: defina KIWI_API_KEY (chave de parceiro Tequila da Kiwi.com)."
    );
  }

  // Cota e preferências em paralelo (independentes). Com a cota negada, a
  // leitura das preferências é descartada: nada é buscado na Kiwi.
  const [cota, preferences] = await Promise.all([
    consumirCota(supabase, userId, "voos"),
    parsed.data.memory ? loadPreferencesSafe({ supabase, userId }) : Promise.resolve({}),
  ]);
  if (!cota.permitido) return respostaCotaNegada(cota);
  const { query, applied } = applyFlightPreferences(parsed.data, preferences);

  const result = await searchFlights(query, applied);
  if (!result.ok) return upstreamErrorResponse(result.status, result.message);

  return NextResponse.json<FlightSearchResponse>(result.data);
}
