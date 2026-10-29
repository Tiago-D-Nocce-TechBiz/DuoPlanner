import { NextResponse, type NextRequest } from "next/server";
import { loadPreferencesSafe } from "@/lib/memory/store";
import {
  applyHotelPreferences,
  isBookingConfigured,
  parseHotelSearchParams,
  searchHotels,
} from "@/lib/travel/booking";
import {
  invalidParamsResponse,
  notConfiguredResponse,
  upstreamErrorResponse,
} from "@/lib/travel/http";
import type { HotelSearchResponse } from "@/lib/travel/types";

/**
 * GET /api/hotels — motor de hospedagem (Booking.com via RapidAPI).
 *
 * Query string:
 *   city                destino (ex.: Lisboa)
 *   checkin, checkout   AAAA-MM-DD
 *   adults              padrão 2 → preço TOTAL da estadia para a dupla
 *   rooms               padrão 1
 *   budget              teto do total da estadia (BRL)
 *   minScore            nota mínima (0–10)
 *   memory              1 | 0 — aplica as preferências memorizadas pela IA
 *
 * Resposta: HotelSearchResponse, ordenada por custo-benefício (valueScore).
 */
export async function GET(request: NextRequest) {
  const parsed = parseHotelSearchParams(request.nextUrl.searchParams);
  if (!parsed.success) return invalidParamsResponse(parsed.error);

  if (!isBookingConfigured()) {
    return notConfiguredResponse(
      "BOOKING_NOT_CONFIGURED",
      "Motor de hospedagem indisponível: defina RAPIDAPI_KEY com assinatura da API Booking.com15."
    );
  }

  const preferences = parsed.data.memory ? await loadPreferencesSafe() : {};
  const { query, applied } = applyHotelPreferences(parsed.data, preferences);

  const result = await searchHotels(query, applied);
  if (!result.ok) return upstreamErrorResponse(result.status, result.message);

  return NextResponse.json<HotelSearchResponse>(result.data);
}
