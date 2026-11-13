import "server-only";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { ambiente } from "@/lib/env";
import { fetchWithTimeout, tempoEsgotado } from "@/lib/http/fetch-com-limite";
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
import type {
  CabinClass,
  FlightLeg,
  FlightOffer,
  FlightSearchResponse,
} from "./types";

/**
 * Motor de voos — Kiwi.com Tequila API (`GET /v2/search`).
 *
 * - Janela de datas flexível: `date_from`/`date_to` para a ida e
 *   `nights_in_dst_from`/`nights_in_dst_to` para a duração da estadia.
 * - Ordenação por menor preço: a Kiwi combina companhias que não têm acordo
 *   entre si (virtual interlining), o que costuma revelar combinações low-cost.
 * - Preços em BRL; `price` da Kiwi é o total para todos os passageiros.
 *
 * Aviso: desde 2024 a Kiwi só libera novas chaves Tequila por convite.
 * Sem KIWI_API_KEY a rota responde 503 e a UI mostra os links da Fase 1.
 */

const DEFAULT_BASE_URL = "https://api.tequila.kiwi.com";
const RESULT_LIMIT = 20;

/* ------------------------------- Validação ------------------------------- */

const iataSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use o código IATA de 3 letras (ex.: GRU).");

const CABINS = ["economy", "premium", "business", "first"] as const;

export const flightSearchSchema = z
  .object({
    from: iataSchema,
    to: iataSchema,
    dateFrom: isoDateSchema,
    dateTo: isoDateSchema.optional(),
    tripType: z.enum(["round", "oneway"]).default("round"),
    nightsFrom: z.coerce.number().int().min(1).max(30).default(5),
    nightsTo: z.coerce.number().int().min(1).max(30).optional(),
    adults: z.coerce.number().int().min(1).max(9).default(2),
    cabin: z.enum(CABINS).default("economy"),
    maxStopovers: z.coerce.number().int().min(0).max(3).optional(),
    maxLayoverHours: z.coerce.number().min(1).max(48).optional(),
    budget: z.coerce.number().min(1).max(1_000_000).optional(),
    sort: z.enum(["price", "duration", "quality"]).default("price"),
    memory: boolParam.default(true),
  })
  .superRefine((q, ctx) => {
    const dateTo = q.dateTo ?? q.dateFrom;
    if (q.dateFrom < todayInSaoPaulo()) {
      ctx.addIssue({
        code: "custom",
        path: ["dateFrom"],
        message: "A data de ida não pode estar no passado.",
      });
    }
    if (dateTo < q.dateFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "O fim da janela deve ser igual ou posterior ao início.",
      });
    } else if (daysBetween(q.dateFrom, dateTo) > 31) {
      ctx.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "A janela de datas pode ter no máximo 31 dias.",
      });
    }
    if (q.from === q.to) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "Origem e destino precisam ser diferentes.",
      });
    }
    if (q.nightsTo !== undefined && q.nightsTo < q.nightsFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["nightsTo"],
        message: "O máximo de noites deve ser maior ou igual ao mínimo.",
      });
    }
  });

export type FlightSearchInput = z.infer<typeof flightSearchSchema>;

export function parseFlightSearchParams(params: URLSearchParams) {
  return flightSearchSchema.safeParse(searchParamsToObject(params));
}

/**
 * Agente de Memória → motor de voos: preferências salvas preenchem apenas os
 * filtros que a dupla não informou nesta busca (o que foi digitado vence).
 */
export function applyFlightPreferences(
  q: FlightSearchInput,
  prefs: DuoPreferences
): { query: FlightSearchInput; applied: string[] } {
  if (!q.memory) return { query: q, applied: [] };
  const query = { ...q };
  const applied: string[] = [];

  if (query.maxStopovers === undefined && prefs.max_escalas !== undefined) {
    query.maxStopovers = prefs.max_escalas;
    applied.push(describePreference("max_escalas", prefs.max_escalas));
  }
  if (
    query.maxLayoverHours === undefined &&
    prefs.max_duracao_escala_horas !== undefined
  ) {
    query.maxLayoverHours = prefs.max_duracao_escala_horas;
    applied.push(
      describePreference(
        "max_duracao_escala_horas",
        prefs.max_duracao_escala_horas
      )
    );
  }
  if (query.budget === undefined && prefs.orcamento_voo_max !== undefined) {
    query.budget = prefs.orcamento_voo_max;
    applied.push(describePreference("orcamento_voo_max", prefs.orcamento_voo_max));
  }
  return { query, applied };
}

/* ---------------------------- Resposta da Kiwi ---------------------------- */

const segmentSchema = z.object({
  flyFrom: z.string(),
  flyTo: z.string(),
  cityFrom: z.string().nullish(),
  cityTo: z.string().nullish(),
  local_departure: z.string(),
  local_arrival: z.string(),
  utc_departure: z.string(),
  utc_arrival: z.string(),
  airline: z.string(),
  flight_no: z.union([z.number(), z.string()]).nullish(),
  return: z.number().nullish(),
  bags_recheck_required: z.boolean().nullish(),
});

type KiwiSegment = z.infer<typeof segmentSchema>;

const itinerarySchema = z.object({
  id: z.string(),
  price: z.number(),
  airlines: z.array(z.string()).nullish(),
  route: z.array(segmentSchema).min(1),
  nightsInDest: z.number().nullish(),
  duration: z
    .object({
      departure: z.number().nullish(),
      return: z.number().nullish(),
    })
    .nullish(),
  deep_link: z.string().nullish(),
  availability: z.object({ seats: z.number().nullish() }).nullish(),
  has_airport_change: z.boolean().nullish(),
  virtual_interlining: z.boolean().nullish(),
});

const responseSchema = z.object({
  currency: z.string().nullish(),
  data: z.array(z.unknown()).default([]),
});

/* ------------------------ Companhias e low-cost ------------------------ */

const AIRLINE_NAMES: Record<string, string> = {
  LA: "LATAM", JJ: "LATAM Brasil", G3: "GOL", AD: "Azul", "2Z": "Voepass",
  TP: "TAP Air Portugal", AR: "Aerolíneas Argentinas", AV: "Avianca",
  CM: "Copa", JA: "JetSMART", H2: "Sky Airline", FO: "Flybondi",
  DM: "Arajet", P5: "Wingo", AA: "American", UA: "United", DL: "Delta",
  AF: "Air France", KL: "KLM", IB: "Iberia", UX: "Air Europa",
  LH: "Lufthansa", BA: "British Airways", AZ: "ITA Airways", LX: "SWISS",
  EK: "Emirates", QR: "Qatar Airways", TK: "Turkish Airlines",
  ET: "Ethiopian", AT: "Royal Air Maroc", FR: "Ryanair", U2: "easyJet",
  W6: "Wizz Air", VY: "Vueling", V7: "Volotea", HV: "Transavia",
  DY: "Norwegian", EW: "Eurowings", LS: "Jet2", PC: "Pegasus",
  NK: "Spirit", F9: "Frontier", WN: "Southwest", Y4: "Volaris",
  VB: "Viva Aerobus", TR: "Scoot", AK: "AirAsia", "5J": "Cebu Pacific",
  VJ: "VietJet", "6E": "IndiGo", G9: "Air Arabia", FZ: "flydubai",
};

/** Companhias low-cost conhecidas (lista conservadora, por código IATA). */
const LOW_COST = new Set([
  "G3", "JA", "H2", "FO", "DM", "P5", "Y4", "VB", "NK", "F9", "G4", "WN",
  "FR", "RK", "U2", "EC", "DS", "W6", "W4", "W9", "VY", "V7", "HV", "TO",
  "DY", "D8", "EW", "LS", "PC", "AK", "FD", "D7", "QZ", "Z2", "TR", "5J",
  "VJ", "6E", "SG", "G9", "FZ", "XY", "J9", "MM", "GK", "JQ", "3K", "F3",
]);

/* ------------------------------ Normalização ------------------------------ */

function minutesBetween(startIso: string, endIso: string): number {
  const diff = (Date.parse(endIso) - Date.parse(startIso)) / 60_000;
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : 0;
}

function toLeg(segments: KiwiSegment[], durationSeconds?: number | null): FlightLeg {
  const sorted = [...segments].sort(
    (a, b) => Date.parse(a.utc_departure) - Date.parse(b.utc_departure)
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const duration =
    durationSeconds && durationSeconds > 0
      ? Math.round(durationSeconds / 60)
      : minutesBetween(first.utc_departure, last.utc_arrival);

  return {
    from: { iata: first.flyFrom, city: first.cityFrom ?? first.flyFrom },
    to: { iata: last.flyTo, city: last.cityTo ?? last.flyTo },
    departureLocal: first.local_departure,
    arrivalLocal: last.local_arrival,
    durationMinutes: duration,
    stops: sorted.length - 1,
    layovers: sorted.slice(1).map((segment, i) => ({
      airport: segment.flyFrom,
      city: segment.cityFrom ?? segment.flyFrom,
      minutes: minutesBetween(sorted[i].utc_arrival, segment.utc_departure),
    })),
    segments: sorted.map((s) => ({
      from: s.flyFrom,
      to: s.flyTo,
      airline: s.airline,
      flightNumber: `${s.airline}${s.flight_no ?? ""}`,
      departureLocal: s.local_departure,
      arrivalLocal: s.local_arrival,
    })),
  };
}

/** Só aceita links https da própria Kiwi (o link é renderizado na UI). */
function safeKiwiUrl(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    const isKiwi = host === "kiwi.com" || host.endsWith(".kiwi.com");
    return url.protocol === "https:" && isKiwi ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeItinerary(raw: unknown, adults: number): FlightOffer | null {
  const parsed = itinerarySchema.safeParse(raw);
  if (!parsed.success) return null;
  const it = parsed.data;

  const outboundSegments = it.route.filter((s) => !s.return);
  const inboundSegments = it.route.filter((s) => s.return === 1);
  if (outboundSegments.length === 0) return null;

  const outbound = toLeg(outboundSegments, it.duration?.departure);
  const inbound = inboundSegments.length
    ? toLeg(inboundSegments, it.duration?.return)
    : null;

  const codes = Array.from(
    new Set(it.airlines?.length ? it.airlines : it.route.map((s) => s.airline))
  );

  return {
    id: it.id,
    price: round2(it.price),
    pricePerPerson: round2(it.price / adults),
    airlines: codes.map((code) => ({
      code,
      name: AIRLINE_NAMES[code] ?? code,
      lowCost: LOW_COST.has(code),
    })),
    lowCost: codes.some((code) => LOW_COST.has(code)),
    isKiwiCombo: Boolean(it.virtual_interlining),
    bagsRecheck: it.route.some((s) => Boolean(s.bags_recheck_required)),
    hasAirportChange: Boolean(it.has_airport_change),
    outbound,
    inbound,
    nightsInDest: it.nightsInDest ?? null,
    seatsLeft: it.availability?.seats ?? null,
    totalDurationMinutes: outbound.durationMinutes + (inbound?.durationMinutes ?? 0),
    bookingUrl: safeKiwiUrl(it.deep_link),
    withinBudget: null,
  };
}

/* ------------------------------ Chamada HTTP ------------------------------ */

/** Somente o que muda a resposta da Kiwi (também é a chave do cache). */
interface KiwiRequest {
  from: string;
  to: string;
  dateFrom: string;
  dateTo: string;
  tripType: "round" | "oneway";
  nightsFrom: number;
  nightsTo: number;
  adults: number;
  cabin: CabinClass;
  maxStopovers: number | null;
  maxLayoverHours: number | null;
  sort: "price" | "duration" | "quality";
}

const CABIN_CODES: Record<CabinClass, string> = {
  economy: "M",
  premium: "W",
  business: "C",
  first: "F",
};

/** A Tequila usa datas dd/mm/aaaa. */
function toKiwiDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function buildKiwiParams(req: KiwiRequest): URLSearchParams {
  const params = new URLSearchParams({
    fly_from: req.from,
    fly_to: req.to,
    date_from: toKiwiDate(req.dateFrom),
    date_to: toKiwiDate(req.dateTo),
    flight_type: req.tripType,
    adults: String(req.adults),
    selected_cabins: CABIN_CODES[req.cabin],
    curr: "BRL",
    locale: "pt",
    sort: req.sort,
    asc: "1",
    vehicle_type: "aircraft",
    // Pedimos mais que o exibido porque os filtros de escala são reaplicados.
    limit: String(RESULT_LIMIT * 3),
  });
  if (req.tripType === "round") {
    params.set("nights_in_dst_from", String(req.nightsFrom));
    params.set("nights_in_dst_to", String(req.nightsTo));
  }
  if (req.maxStopovers !== null) {
    params.set("max_sector_stopovers", String(req.maxStopovers));
  }
  if (req.maxLayoverHours !== null) {
    const hours = Math.floor(req.maxLayoverHours);
    params.set("stopover_to", `${String(hours).padStart(2, "0")}:00`);
  }
  return params;
}

/**
 * Busca na Kiwi com cache de servidor.
 * Sucesso: 10 min (preços de voo mudam rápido). Erro: perfil "seconds", para
 * não repetir falhas em sequência sem prender um erro por muito tempo.
 * A chave da API é lida aqui dentro e nunca entra na chave do cache.
 */
async function fetchKiwiOffers(
  req: KiwiRequest
): Promise<UpstreamResult<FlightOffer[]>> {
  "use cache";

  const voos = ambiente().voos;
  if (!voos) {
    cacheLife("seconds");
    return { ok: false, status: 503, message: "KIWI_API_KEY não configurada." };
  }
  const apiKey = voos.apiKey;
  const baseUrl = voos.baseUrl || DEFAULT_BASE_URL;

  try {
    const res = await fetchWithTimeout(`${baseUrl}/v2/search?${buildKiwiParams(req)}`, {
      headers: { apikey: apiKey, accept: "application/json" },
    });
    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      cacheLife("seconds");
      return {
        ok: false,
        status: res.status,
        message: upstreamMessage(body, `Kiwi.com respondeu ${res.status}.`),
      };
    }

    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      cacheLife("seconds");
      return { ok: false, status: 502, message: "Resposta inesperada da Kiwi.com." };
    }

    const offers = parsed.data.data
      .map((raw) => normalizeItinerary(raw, req.adults))
      .filter((offer): offer is FlightOffer => offer !== null);

    cacheLife({ stale: 300, revalidate: 600, expire: 1800 });
    return { ok: true, data: offers };
  } catch (error) {
    cacheLife("seconds");
    const timedOut = tempoEsgotado(error);
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      message: timedOut
        ? "A Kiwi.com demorou demais para responder."
        : "Não foi possível falar com a Kiwi.com.",
    };
  }
}

/* --------------------------------- Busca --------------------------------- */

export async function searchFlights(
  q: FlightSearchInput,
  appliedPreferences: string[]
): Promise<UpstreamResult<FlightSearchResponse>> {
  const nightsTo = Math.max(q.nightsTo ?? q.nightsFrom + 3, q.nightsFrom);
  const result = await fetchKiwiOffers({
    from: q.from,
    to: q.to,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo ?? q.dateFrom,
    tripType: q.tripType,
    nightsFrom: q.nightsFrom,
    nightsTo,
    adults: q.adults,
    cabin: q.cabin,
    maxStopovers: q.maxStopovers ?? null,
    maxLayoverHours: q.maxLayoverHours ?? null,
    sort: q.sort,
  });
  if (!result.ok) return result;

  // Reaplica os filtros localmente: garante o resultado mesmo que a semântica
  // de algum parâmetro da Tequila mude.
  const legs = (o: FlightOffer) => (o.inbound ? [o.outbound, o.inbound] : [o.outbound]);
  const filtered = result.data.filter((o) =>
    legs(o).every(
      (leg) =>
        (q.maxStopovers === undefined || leg.stops <= q.maxStopovers) &&
        (q.maxLayoverHours === undefined ||
          leg.layovers.every((l) => l.minutes <= q.maxLayoverHours! * 60))
    )
  );

  let offers = filtered;
  let budgetNotice: string | null = null;
  if (q.budget !== undefined) {
    const within = filtered.filter((o) => o.price <= q.budget!);
    if (within.length > 0) {
      offers = within;
    } else if (filtered.length > 0) {
      budgetNotice = `Nenhum voo cabe no orçamento de ${formatCurrency(q.budget)}. Mostrando os mais próximos.`;
    }
  }

  const visible = offers.slice(0, RESULT_LIMIT).map((o) => ({
    ...o,
    withinBudget: q.budget === undefined ? null : o.price <= q.budget,
  }));

  const cheapest = visible.reduce<FlightOffer | null>(
    (best, o) => (!best || o.price < best.price ? o : best),
    null
  );
  const fastest = visible.reduce<FlightOffer | null>(
    (best, o) =>
      !best || o.totalDurationMinutes < best.totalDurationMinutes ? o : best,
    null
  );

  return {
    ok: true,
    data: {
      source: "kiwi",
      currency: "BRL",
      adults: q.adults,
      offers: visible,
      cheapestId: cheapest?.id ?? null,
      fastestId: fastest?.id ?? null,
      totalFound: filtered.length,
      budgetNotice,
      appliedPreferences,
    },
  };
}
