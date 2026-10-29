import "server-only";
import { cacheLife } from "next/cache";
import { z } from "zod";
import {
  describePreference,
  type DuoPreferences,
} from "@/lib/memory/preferences";
import { formatCurrency } from "@/lib/utils";
import {
  boolParam,
  daysBetween,
  isoDateSchema,
  round2,
  searchParamsToObject,
  todayInSaoPaulo,
  upstreamMessage,
  type UpstreamResult,
} from "./params";
import type { HotelOffer, HotelSearchResponse } from "./types";

/**
 * Motor de hospedagem — Booking.com via RapidAPI ("Booking.com15",
 * host booking-com15.p.rapidapi.com).
 *
 * Fluxo: `searchDestination` (cidade → dest_id, cache de dias) →
 * `searchHotels` (datas, adultos, quartos; cache de 30 min) → preço TOTAL da
 * estadia para a dupla → ranking próprio de custo-benefício.
 *
 * Decisão: não enviamos `sort_by`. A ordem padrão (popularidade) traz um mix
 * de faixas de preço e o ranking de custo-benefício é calculado aqui, de forma
 * transparente, em vez de depender de um id de ordenação do provedor.
 */

const DEFAULT_HOST = "booking-com15.p.rapidapi.com";
const RESULT_LIMIT = 20;

export function isBookingConfigured(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY);
}

function rapidApiConfig() {
  return {
    key: process.env.RAPIDAPI_KEY,
    host: process.env.RAPIDAPI_BOOKING_HOST || DEFAULT_HOST,
  };
}

/* ------------------------------- Validação ------------------------------- */

export const hotelSearchSchema = z
  .object({
    city: z
      .string()
      .trim()
      .min(2, "Informe o destino.")
      .max(80)
      .regex(/^[\p{L}\p{M}\s'’.,()-]+$/u, "Use apenas letras no nome do destino."),
    checkin: isoDateSchema,
    checkout: isoDateSchema,
    adults: z.coerce.number().int().min(1).max(8).default(2),
    rooms: z.coerce.number().int().min(1).max(4).default(1),
    budget: z.coerce.number().min(1).max(1_000_000).optional(),
    minScore: z.coerce.number().min(0).max(10).optional(),
    memory: boolParam.default(true),
  })
  .superRefine((q, ctx) => {
    if (q.checkin < todayInSaoPaulo()) {
      ctx.addIssue({
        code: "custom",
        path: ["checkin"],
        message: "O check-in não pode estar no passado.",
      });
    }
    const nights = daysBetween(q.checkin, q.checkout);
    if (nights < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["checkout"],
        message: "O check-out deve ser depois do check-in.",
      });
    } else if (nights > 30) {
      ctx.addIssue({
        code: "custom",
        path: ["checkout"],
        message: "A estadia pode ter no máximo 30 noites.",
      });
    }
    if (q.rooms > q.adults) {
      ctx.addIssue({
        code: "custom",
        path: ["rooms"],
        message: "Há mais quartos do que hóspedes.",
      });
    }
  });

export type HotelSearchInput = z.infer<typeof hotelSearchSchema>;

export function parseHotelSearchParams(params: URLSearchParams) {
  return hotelSearchSchema.safeParse(searchParamsToObject(params));
}

/** Preferências salvas preenchem apenas o que não foi informado nesta busca. */
export function applyHotelPreferences(
  q: HotelSearchInput,
  prefs: DuoPreferences
): { query: HotelSearchInput; applied: string[] } {
  if (!q.memory) return { query: q, applied: [] };
  const query = { ...q };
  const applied: string[] = [];

  if (query.budget === undefined && prefs.orcamento_hospedagem_max !== undefined) {
    query.budget = prefs.orcamento_hospedagem_max;
    applied.push(
      describePreference("orcamento_hospedagem_max", prefs.orcamento_hospedagem_max)
    );
  }
  if (query.minScore === undefined && prefs.nota_minima_hospedagem !== undefined) {
    query.minScore = prefs.nota_minima_hospedagem;
    applied.push(
      describePreference("nota_minima_hospedagem", prefs.nota_minima_hospedagem)
    );
  }
  return { query, applied };
}

/* ------------------------------ HTTP RapidAPI ------------------------------ */

async function rapidApiGet(
  path: string,
  params: Record<string, string>
): Promise<UpstreamResult<unknown>> {
  const { key, host } = rapidApiConfig();
  if (!key) return { ok: false, status: 503, message: "RAPIDAPI_KEY não configurada." };

  try {
    const res = await fetch(`https://${host}${path}?${new URLSearchParams(params)}`, {
      headers: {
        "x-rapidapi-key": key,
        "x-rapidapi-host": host,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const message =
        res.status === 403
          ? "A chave RapidAPI não tem assinatura ativa da API Booking.com15."
          : res.status === 429
            ? "Limite de requisições do plano RapidAPI atingido."
            : upstreamMessage(body, `Booking.com respondeu ${res.status}.`);
      return { ok: false, status: res.status, message };
    }
    // A Booking.com15 sinaliza erros de validação com `status: false` e HTTP 200.
    if (body && typeof body === "object" && (body as { status?: unknown }).status === false) {
      return {
        ok: false,
        status: 502,
        message: upstreamMessage(body, "A Booking.com recusou a busca."),
      };
    }
    return { ok: true, data: body };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      message: timedOut
        ? "A Booking.com demorou demais para responder."
        : "Não foi possível falar com a Booking.com.",
    };
  }
}

/* ------------------------------ Destino (cache) ------------------------------ */

const destinationSchema = z.object({
  dest_id: z.union([z.string(), z.number()]).transform(String),
  search_type: z.string().nullish(),
  dest_type: z.string().nullish(),
  name: z.string().nullish(),
  label: z.string().nullish(),
  country: z.string().nullish(),
});

interface BookingDestination {
  id: string;
  searchType: string;
  name: string;
  label: string;
  country: string | null;
}

async function lookupDestination(
  query: string
): Promise<UpstreamResult<BookingDestination>> {
  "use cache";

  const result = await rapidApiGet("/api/v1/hotels/searchDestination", { query });
  if (!result.ok) {
    cacheLife("seconds");
    return result;
  }

  const list = z
    .object({ data: z.array(z.unknown()).default([]) })
    .safeParse(result.data);
  const candidates = (list.success ? list.data.data : [])
    .map((item) => destinationSchema.safeParse(item))
    .flatMap((p) => (p.success ? [p.data] : []));
  const best =
    candidates.find((d) => (d.dest_type ?? d.search_type)?.toLowerCase() === "city") ??
    candidates[0];

  if (!best) {
    cacheLife("hours");
    return { ok: false, status: 404, message: `Destino "${query}" não encontrado na Booking.com.` };
  }

  cacheLife("days");
  return {
    ok: true,
    data: {
      id: best.dest_id,
      searchType: (best.search_type ?? best.dest_type ?? "city").toUpperCase(),
      name: best.name ?? query,
      label: best.label ?? best.name ?? query,
      country: best.country ?? null,
    },
  };
}

/* ------------------------------ Hotéis (cache) ------------------------------ */

const moneySchema = z.object({ value: z.number(), currency: z.string() });

const hotelSchema = z.object({
  hotel_id: z.union([z.number(), z.string()]).transform(String),
  property: z.object({
    name: z.string(),
    reviewScore: z.number().nullish(),
    reviewScoreWord: z.string().nullish(),
    reviewCount: z.number().nullish(),
    propertyClass: z.number().nullish(),
    accuratePropertyClass: z.number().nullish(),
    photoUrls: z.array(z.string()).nullish(),
    checkin: z.object({ fromTime: z.string().nullish() }).nullish(),
    checkout: z.object({ untilTime: z.string().nullish() }).nullish(),
    priceBreakdown: z.object({
      grossPrice: moneySchema,
      strikethroughPrice: moneySchema.nullish(),
      excludedPrice: moneySchema.nullish(),
    }),
  }),
});

interface HotelsRequest {
  destId: string;
  searchType: string;
  checkin: string;
  checkout: string;
  adults: number;
  rooms: number;
}

/** Foto em tamanho médio; só aceitamos o CDN da Booking (ver next.config.ts). */
function bookingPhoto(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("bstatic.com")) {
      return null;
    }
    parsed.pathname = parsed.pathname.replace(/\/square\d+\//, "/square240/");
    return parsed.toString();
  } catch {
    return null;
  }
}

function bookingHotelUrl(id: string, name: string, req: HotelsRequest): string {
  const params = new URLSearchParams({
    ss: name,
    dest_id: id,
    dest_type: "hotel",
    checkin: req.checkin,
    checkout: req.checkout,
    group_adults: String(req.adults),
    no_rooms: String(req.rooms),
    group_children: "0",
  });
  return `https://www.booking.com/searchresults.pt-br.html?${params}`;
}

type RawOffer = Omit<HotelOffer, "valueScore" | "withinBudget">;

async function fetchHotels(req: HotelsRequest): Promise<UpstreamResult<RawOffer[]>> {
  "use cache";

  const result = await rapidApiGet("/api/v1/hotels/searchHotels", {
    dest_id: req.destId,
    search_type: req.searchType,
    arrival_date: req.checkin,
    departure_date: req.checkout,
    adults: String(req.adults),
    room_qty: String(req.rooms),
    page_number: "1",
    units: "metric",
    temperature_unit: "c",
    languagecode: "pt-br",
    currency_code: "BRL",
  });
  if (!result.ok) {
    cacheLife("seconds");
    return result;
  }

  const envelope = z
    .object({ data: z.object({ hotels: z.array(z.unknown()).default([]) }) })
    .safeParse(result.data);
  if (!envelope.success) {
    cacheLife("seconds");
    return { ok: false, status: 502, message: "Resposta inesperada da Booking.com." };
  }

  const nights = Math.max(1, daysBetween(req.checkin, req.checkout));
  const offers: RawOffer[] = [];

  for (const item of envelope.data.data.hotels) {
    const parsed = hotelSchema.safeParse(item);
    if (!parsed.success) continue; // ex.: propriedade esgotada, sem preço
    const { hotel_id: id, property: p } = parsed.data;
    const gross = p.priceBreakdown.grossPrice;
    const excluded = p.priceBreakdown.excludedPrice;
    const extraTaxes =
      excluded && excluded.currency === gross.currency ? excluded.value : 0;
    const total = round2(gross.value + extraTaxes);
    if (!(total > 0)) continue;

    const stars = p.accuratePropertyClass || p.propertyClass || null;
    const strike = p.priceBreakdown.strikethroughPrice;

    offers.push({
      id,
      name: p.name,
      stars: stars ? Math.round(stars) : null,
      reviewScore: p.reviewScore ? round2(p.reviewScore) : null,
      reviewWord: p.reviewScoreWord ?? null,
      reviewCount: p.reviewCount ?? 0,
      totalPrice: total,
      pricePerNight: round2(total / nights),
      originalPrice:
        strike && strike.currency === gross.currency && strike.value > gross.value
          ? round2(strike.value + extraTaxes)
          : null,
      // Sem `excludedPrice` o bruto já é o total; com ele na mesma moeda, somamos.
      taxesIncluded: !excluded || excluded.currency === gross.currency,
      currency: gross.currency,
      photoUrl: bookingPhoto(p.photoUrls?.[0]),
      checkinFrom: p.checkin?.fromTime ?? null,
      checkoutUntil: p.checkout?.untilTime ?? null,
      bookingUrl: bookingHotelUrl(id, p.name, req),
    });
  }

  cacheLife({ stale: 300, revalidate: 1800, expire: 3600 });
  return { ok: true, data: offers };
}

/* --------------------------- Custo-benefício --------------------------- */

/**
 * Pontuação 0–100 = 50% qualidade + 50% preço, relativa ao conjunto buscado.
 * - Qualidade: média bayesiana da nota (prior 6,5 com peso de 25 avaliações),
 *   para que um 10 com 3 avaliações não vença um 9,1 com 2.000 e para que
 *   anúncios sem avaliação não passem à frente de lugares bem avaliados.
 *   Normalizada na faixa útil das notas da Booking: 6 → 0 e 10 → 1.
 * - Preço: raiz de (menor total ÷ total do hotel). 1 = o mais barato; a raiz
 *   suaviza diferenças grandes para um 9,2 a 2x o preço não perder para um 7,1.
 */
const PRIOR_SCORE = 6.5;
const PRIOR_WEIGHT = 25;

function rankByValue(offers: RawOffer[]): Omit<HotelOffer, "withinBudget">[] {
  if (offers.length === 0) return [];
  const minPrice = Math.min(...offers.map((o) => o.totalPrice));

  return offers
    .map((o) => {
      const n = o.reviewScore ? o.reviewCount : 0;
      const r = o.reviewScore ?? PRIOR_SCORE;
      const bayes = (n * r + PRIOR_WEIGHT * PRIOR_SCORE) / (n + PRIOR_WEIGHT);
      const quality = Math.min(1, Math.max(0, (bayes - 6) / 4));
      const price = Math.sqrt(minPrice / o.totalPrice);
      const valueScore = Math.round(100 * (0.5 * quality + 0.5 * price));
      return { ...o, valueScore };
    })
    .sort((a, b) => b.valueScore - a.valueScore || a.totalPrice - b.totalPrice);
}

/* --------------------------------- Busca --------------------------------- */

export async function searchHotels(
  q: HotelSearchInput,
  appliedPreferences: string[]
): Promise<UpstreamResult<HotelSearchResponse>> {
  const destination = await lookupDestination(q.city.toLowerCase());
  if (!destination.ok) return destination;

  const result = await fetchHotels({
    destId: destination.data.id,
    searchType: destination.data.searchType,
    checkin: q.checkin,
    checkout: q.checkout,
    adults: q.adults,
    rooms: q.rooms,
  });
  if (!result.ok) return result;

  const eligible =
    q.minScore === undefined
      ? result.data
      : result.data.filter((o) => (o.reviewScore ?? 0) >= q.minScore!);
  const ranked = rankByValue(eligible);

  let pool = ranked;
  let budgetNotice: string | null = null;
  if (q.budget !== undefined) {
    const within = ranked.filter((o) => o.totalPrice <= q.budget!);
    if (within.length > 0) {
      pool = within;
    } else if (ranked.length > 0) {
      pool = [...ranked].sort((a, b) => a.totalPrice - b.totalPrice);
      budgetNotice = `Nenhuma hospedagem cabe no orçamento de ${formatCurrency(q.budget)}. Mostrando as mais baratas.`;
    }
  }

  const hotels: HotelOffer[] = pool.slice(0, RESULT_LIMIT).map((o) => ({
    ...o,
    withinBudget: q.budget === undefined ? null : o.totalPrice <= q.budget,
  }));

  return {
    ok: true,
    data: {
      source: "booking",
      destination: {
        name: destination.data.name,
        label: destination.data.label,
        country: destination.data.country,
      },
      checkin: q.checkin,
      checkout: q.checkout,
      nights: Math.max(1, daysBetween(q.checkin, q.checkout)),
      adults: q.adults,
      rooms: q.rooms,
      currency: hotels[0]?.currency ?? "BRL",
      hotels,
      totalFound: eligible.length,
      budgetNotice,
      appliedPreferences,
    },
  };
}
