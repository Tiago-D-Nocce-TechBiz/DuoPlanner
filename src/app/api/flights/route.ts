import { NextResponse, type NextRequest } from "next/server";
import { loadPreferencesSafe } from "@/lib/memory/store";
import {
  invalidParamsResponse,
  notConfiguredResponse,
  upstreamErrorResponse,
} from "@/lib/travel/http";
import {
  applyFlightPreferences,
  isKiwiConfigured,
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
 * Resposta: FlightSearchResponse (preços totais e por pessoa, em BRL).
 * Com Cache Components, a leitura da query torna o handler dinâmico; o cache
 * fica na chamada à Kiwi (`fetchKiwiOffers`, 10 min).
 */
export async function GET(request: NextRequest) {
  const parsed = parseFlightSearchParams(request.nextUrl.searchParams);
  if (!parsed.success) return invalidParamsResponse(parsed.error);

  if (!isKiwiConfigured()) {
    return notConfiguredResponse(
      "KIWI_NOT_CONFIGURED",
      "Motor de voos indisponível: defina KIWI_API_KEY (chave de parceiro Tequila da Kiwi.com)."
    );
  }

  const preferences = parsed.data.memory ? await loadPreferencesSafe() : {};
  const { query, applied } = applyFlightPreferences(parsed.data, preferences);

  const result = await searchFlights(query, applied);
  if (!result.ok) return upstreamErrorResponse(result.status, result.message);

  return NextResponse.json<FlightSearchResponse>(result.data);
}
