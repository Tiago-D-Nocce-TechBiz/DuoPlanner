/**
 * Motor de Busca — Deep Linking Outbound.
 *
 * O PlannerDuo NÃO executa pesquisa interna. A partir dos dados fornecidos pelo
 * usuário, gera URLs de pesquisa pré-preenchidas para plataformas parceiras e
 * abre-as numa nova aba.
 *
 * IMPORTANTE (decisão de engenharia):
 * As estruturas de URL e os query parameters dos sites externos mudam com
 * frequência e não são contratos públicos estáveis. Centralizamos aqui a
 * construção dos links para que, quando um parceiro alterar o seu formato,
 * exista um único ponto de manutenção. Os parâmetros são codificados via
 * URLSearchParams/encodeURIComponent para evitar injeção/quebra de URL.
 */

export type TripType = "round" | "oneway";
export type CabinClass = "economy" | "premium" | "business" | "first";

export interface ProviderLink {
  id: string;
  name: string;
  url: string;
  note: string;
}

/* ========================================================================== */
/*                               BUSCAR VIAGEM                                */
/* ========================================================================== */

export interface FlightQuery {
  originCity?: string;
  destinationCity?: string;
  originIata: string;
  destinationIata: string;
  departDate: string; // ISO yyyy-mm-dd
  returnDate?: string; // ISO yyyy-mm-dd
  tripType: TripType;
  passengers: number;
  cabin: CabinClass;
}

/** LATAM — /br/pt/oferta-voos com datas em ISO + meia-noite UTC. */
function buildLatam(q: FlightQuery): string {
  const cabinMap: Record<CabinClass, string> = {
    economy: "Economy",
    premium: "PremiumEconomy",
    business: "Business",
    first: "First",
  };
  const params = new URLSearchParams({
    origin: q.originIata,
    destination: q.destinationIata,
    outbound: `${q.departDate}T00:00:00.000Z`,
    adt: String(q.passengers),
    chd: "0",
    inf: "0",
    trip: q.tripType === "round" ? "RT" : "OW",
    cabin: cabinMap[q.cabin],
    redemption: "false",
    sort: "RECOMMENDED",
  });
  if (q.tripType === "round" && q.returnDate) {
    params.set("inbound", `${q.returnDate}T00:00:00.000Z`);
  }
  return `https://www.latamairlines.com/br/pt/oferta-voos?${params.toString()}`;
}

/** Azul — fluxo de reserva com origem/destino/datas/passageiros. */
function buildAzul(q: FlightQuery): string {
  const params = new URLSearchParams({
    c: "pt-BR",
    o1: q.originIata,
    d1: q.destinationIata,
    dd1: q.departDate,
    r: q.tripType === "round" ? "true" : "false",
    ADT: String(q.passengers),
    CHD: "0",
    INF: "0",
    mon: "true",
  });
  if (q.tripType === "round" && q.returnDate) {
    params.set("dd2", q.returnDate);
  }
  return `https://reservas.voeazul.com.br/Flight/Select?${params.toString()}`;
}

/** GOL — busca de voos com origem/destino IATA, datas e passageiros. */
function buildGol(q: FlightQuery): string {
  const params = new URLSearchParams({
    origin: q.originIata,
    destination: q.destinationIata,
    departureDate: q.departDate,
    adults: String(q.passengers),
    children: "0",
    infants: "0",
    tripType: q.tripType === "round" ? "RT" : "OW",
  });
  if (q.tripType === "round" && q.returnDate) {
    params.set("returnDate", q.returnDate);
  }
  return `https://b2c.voegol.com.br/compra/busca-de-voos?${params.toString()}`;
}

/**
 * Google Flights — usa um parâmetro de texto livre (`q`) que o Google
 * interpreta. É o formato mais estável e tolerante para deep link.
 */
function buildGoogleFlights(q: FlightQuery): string {
  const parts = [
    "Voos de",
    q.originIata,
    "para",
    q.destinationIata,
    "em",
    q.departDate,
  ];
  if (q.tripType === "round" && q.returnDate) {
    parts.push("voltando", q.returnDate);
  }
  const params = new URLSearchParams({ q: parts.join(" "), hl: "pt-BR" });
  return `https://www.google.com/travel/flights?${params.toString()}`;
}

/**
 * Skyscanner — padrão de rota por path:
 * /transport/flights/<orig>/<dest>/<yymmdd>/<yymmdd>/?adults=&cabinclass=
 */
function buildSkyscanner(q: FlightQuery): string {
  const yymmdd = (iso: string) => iso.replaceAll("-", "").slice(2); // yymmdd
  const o = q.originIata.toLowerCase();
  const d = q.destinationIata.toLowerCase();
  const out = yymmdd(q.departDate);
  const back =
    q.tripType === "round" && q.returnDate ? `/${yymmdd(q.returnDate)}` : "";
  const params = new URLSearchParams({
    adults: String(q.passengers),
    cabinclass: q.cabin,
  });
  return `https://www.skyscanner.com.br/transporte/passagens-aereas/${o}/${d}/${out}${back}/?${params.toString()}`;
}

/** Gera as opções de VOO (LATAM, Azul, GOL, Google Flights, Skyscanner). */
export function buildFlightLinks(q: FlightQuery): ProviderLink[] {
  if (!q.originIata || !q.destinationIata) return [];
  return [
    { id: "latam", name: "LATAM", url: buildLatam(q), note: "Voos LATAM pré-preenchidos." },
    { id: "azul", name: "Azul", url: buildAzul(q), note: "Voos Azul pré-preenchidos." },
    { id: "gol", name: "GOL", url: buildGol(q), note: "Voos GOL pré-preenchidos." },
    {
      id: "google-flights",
      name: "Google Flights",
      url: buildGoogleFlights(q),
      note: "Compare preços e companhias.",
    },
    {
      id: "skyscanner",
      name: "Skyscanner",
      url: buildSkyscanner(q),
      note: "Metabusca de passagens.",
    },
  ];
}

/* ========================================================================== */
/*                             BUSCAR HOSPEDAGEM                              */
/* ========================================================================== */

export interface StayQuery {
  city: string;
  checkin: string; // ISO yyyy-mm-dd
  checkout: string; // ISO yyyy-mm-dd
  guests: number;
  rooms: number;
}

/** Airbnb — /s/<Cidade>/homes com checkin/checkout e hóspedes. */
function buildAirbnb(q: StayQuery): string {
  const city = encodeURIComponent(q.city);
  const params = new URLSearchParams({
    refinement_paths: "/homes",
    checkin: q.checkin,
    checkout: q.checkout,
    adults: String(q.guests),
  });
  return `https://www.airbnb.com.br/s/${city}/homes?${params.toString()}`;
}

/** Booking.com — /searchresults.html com destino, datas, hóspedes e quartos. */
function buildBooking(q: StayQuery): string {
  const params = new URLSearchParams({
    ss: q.city,
    checkin: q.checkin,
    checkout: q.checkout,
    group_adults: String(q.guests),
    no_rooms: String(q.rooms),
    group_children: "0",
  });
  return `https://www.booking.com/searchresults.pt-br.html?${params.toString()}`;
}

/** Hoteis.com — busca por destino com datas e ocupação. */
function buildHoteis(q: StayQuery): string {
  const params = new URLSearchParams({
    "destination-id": q.city,
    q: q.city,
    "startDate": q.checkin,
    "endDate": q.checkout,
    adults: String(q.guests),
    rooms: String(q.rooms),
  });
  return `https://www.hoteis.com/Hotel-Search?${params.toString()}`;
}

/** Trivago — metabusca por destino com janela de datas. */
function buildTrivago(q: StayQuery): string {
  const params = new URLSearchParams({
    query: q.city,
    checkIn: q.checkin,
    checkOut: q.checkout,
    rooms: String(q.rooms),
    adults: String(q.guests),
  });
  return `https://www.trivago.com.br/pt-BR/srl?${params.toString()}`;
}

/** Gera as opções de HOSPEDAGEM (Airbnb, Booking, Hoteis.com, Trivago). */
export function buildStayLinks(q: StayQuery): ProviderLink[] {
  if (!q.city) return [];
  return [
    { id: "airbnb", name: "Airbnb", url: buildAirbnb(q), note: "Casas e apartamentos no destino." },
    { id: "booking", name: "Booking.com", url: buildBooking(q), note: "Hotéis e hospedagens." },
    { id: "hoteis", name: "Hoteis.com", url: buildHoteis(q), note: "Hotéis com programa de fidelidade." },
    { id: "trivago", name: "Trivago", url: buildTrivago(q), note: "Compare preços de hotéis." },
  ];
}
