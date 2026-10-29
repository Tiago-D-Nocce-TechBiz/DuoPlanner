/**
 * Tipos partilhados entre as rotas /api/flights, /api/hotels e a UI.
 * Sem dependências de servidor: pode ser importado por client components.
 */

export type CabinClass = "economy" | "premium" | "business" | "first";
export type FlightTripType = "round" | "oneway";

/* ------------------------------- Voos (Kiwi) ------------------------------- */

export interface FlightSegment {
  from: string;
  to: string;
  airline: string;
  flightNumber: string;
  departureLocal: string;
  arrivalLocal: string;
}

export interface FlightLeg {
  from: { iata: string; city: string };
  to: { iata: string; city: string };
  /** Horário local do aeroporto, em ISO (sem conversão de fuso). */
  departureLocal: string;
  arrivalLocal: string;
  durationMinutes: number;
  stops: number;
  layovers: { airport: string; city: string; minutes: number }[];
  segments: FlightSegment[];
}

export interface FlightOffer {
  id: string;
  /** Preço total para todos os passageiros, em BRL. */
  price: number;
  pricePerPerson: number;
  airlines: { code: string; name: string; lowCost: boolean }[];
  lowCost: boolean;
  /** Combinação de companhias sem acordo entre si, montada pela Kiwi. */
  isKiwiCombo: boolean;
  /** Em combinações, pode ser preciso despachar a bagagem de novo na conexão. */
  bagsRecheck: boolean;
  hasAirportChange: boolean;
  outbound: FlightLeg;
  inbound: FlightLeg | null;
  nightsInDest: number | null;
  seatsLeft: number | null;
  totalDurationMinutes: number;
  bookingUrl: string | null;
  withinBudget: boolean | null;
}

export interface FlightSearchResponse {
  source: "kiwi";
  currency: "BRL";
  adults: number;
  offers: FlightOffer[];
  cheapestId: string | null;
  fastestId: string | null;
  totalFound: number;
  budgetNotice: string | null;
  appliedPreferences: string[];
}

/* ---------------------------- Hospedagem (Booking) ---------------------------- */

export interface HotelOffer {
  id: string;
  name: string;
  stars: number | null;
  reviewScore: number | null;
  reviewWord: string | null;
  reviewCount: number;
  /** Total da estadia para os hóspedes informados (inclui taxas extras quando informadas). */
  totalPrice: number;
  pricePerNight: number;
  originalPrice: number | null;
  taxesIncluded: boolean;
  currency: string;
  photoUrl: string | null;
  checkinFrom: string | null;
  checkoutUntil: string | null;
  bookingUrl: string;
  /** 0–100: combinação de nota (média bayesiana) e preço relativo. */
  valueScore: number;
  withinBudget: boolean | null;
}

export interface HotelSearchResponse {
  source: "booking";
  destination: { name: string; label: string; country: string | null };
  checkin: string;
  checkout: string;
  nights: number;
  adults: number;
  rooms: number;
  currency: string;
  hotels: HotelOffer[];
  totalFound: number;
  budgetNotice: string | null;
  appliedPreferences: string[];
}

/** Corpo de erro comum das rotas de busca. */
export interface SearchErrorBody {
  error: string;
  code:
    | "INVALID_PARAMS"
    | "KIWI_NOT_CONFIGURED"
    | "BOOKING_NOT_CONFIGURED"
    | "UPSTREAM_ERROR"
    | "RATE_LIMITED"
    | "NOT_FOUND"
    // Origem/destino sem código IATA resolvido: só deep links ficam disponíveis.
    | "IATA_NECESSARIO";
  issues?: Record<string, string[] | undefined>;
}
