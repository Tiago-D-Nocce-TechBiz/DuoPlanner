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
/*                          BUSCAR PASSAGENS — ÔNIBUS                         */
/* ========================================================================== */

export interface BusQuery {
  originCity: string;
  destinationCity: string;
  departDate: string; // ISO yyyy-mm-dd
  returnDate?: string; // ISO yyyy-mm-dd (ida e volta)
}

/**
 * Gera links de busca de passagens de ÔNIBUS.
 *
 * Os sites de ônibus brasileiros variam muito na estrutura de URL e vários
 * exigem o fluxo interno de origem/destino. Usamos a busca por termo/consulta
 * mais tolerante possível por provedor; quando o site não expõe query estável,
 * caímos na página de busca com a cidade no caminho ou em `?q=`.
 */
export function buildBusLinks(q: BusQuery): ProviderLink[] {
  if (!q.originCity || !q.destinationCity) return [];
  const o = encodeURIComponent(q.originCity);
  const d = encodeURIComponent(q.destinationCity);
  const data = q.departDate;

  return [
    {
      id: "buser",
      name: "Buser",
      url: `https://www.buser.com.br/onibus/${slug(q.originCity)}/${slug(q.destinationCity)}?ida=${data}`,
      note: "Fretamento colaborativo e viações parceiras.",
    },
    {
      id: "clickbus",
      name: "ClickBus",
      url: `https://www.clickbus.com.br/onibus/${slug(q.originCity)}/${slug(q.destinationCity)}?departureDate=${data}`,
      note: "Maior marketplace de passagens rodoviárias.",
    },
    {
      id: "guanabara",
      name: "Expresso Guanabara",
      url: `https://www.expressoguanabara.com.br/?origem=${o}&destino=${d}&data=${data}`,
      note: "Nordeste e ligações regionais.",
    },
    {
      id: "util",
      name: "Viação UTIL",
      url: `https://www.util.com.br/?origem=${o}&destino=${d}&data=${data}`,
      note: "Sudeste e Centro-Oeste.",
    },
    {
      id: "deonibus",
      name: "DeÔnibus",
      url: `https://www.deonibus.com/onibus/${slug(q.originCity)}/${slug(q.destinationCity)}?data=${data}`,
      note: "Comparador de passagens rodoviárias.",
    },
    {
      id: "flixbus",
      name: "FlixBus",
      url: `https://www.flixbus.com.br/busca?departureCity=${o}&arrivalCity=${d}&rideDate=${data}`,
      note: "Rede internacional de ônibus.",
    },
    {
      id: "gontijo",
      name: "Gontijo",
      url: `https://www.gontijo.com.br/?origem=${o}&destino=${d}&data=${data}`,
      note: "Longas distâncias pelo Brasil.",
    },
    {
      id: "cometa",
      name: "Viação Cometa",
      url: `https://www.viacaocometa.com.br/?origem=${o}&destino=${d}&data=${data}`,
      note: "Sudeste e Sul.",
    },
  ];
}

/** Converte "Belo Horizonte" em "belo-horizonte" para caminhos de URL. */
function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

/** Decolar (voos) — busca por rota com termo tolerante. */
function buildDecolarVoo(q: FlightQuery): string {
  const params = new URLSearchParams({
    from: q.originIata,
    to: q.destinationIata,
    departure: q.departDate,
    adults: String(q.passengers),
  });
  if (q.tripType === "round" && q.returnDate) params.set("return", q.returnDate);
  return `https://www.decolar.com/shop/flights/results/roundtrip/${q.originIata}/${q.destinationIata}/${q.departDate}/${q.returnDate ?? q.departDate}/${q.passengers}/0/0?${params.toString()}`;
}

/** Gera as opções de VOO (LATAM, Azul, GOL, Google Flights, Skyscanner, Decolar). */
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
    { id: "decolar", name: "Decolar", url: buildDecolarVoo(q), note: "Voos e pacotes." },
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

/** Decolar (hospedagem). */
function buildDecolarHotel(q: StayQuery): string {
  const params = new URLSearchParams({
    destination: q.city,
    checkin: q.checkin,
    checkout: q.checkout,
    rooms: String(q.rooms),
    adults: String(q.guests),
  });
  return `https://www.decolar.com/hoteis/?${params.toString()}`;
}

/** Vrbo — casas de temporada. */
function buildVrbo(q: StayQuery): string {
  const params = new URLSearchParams({
    q: q.city,
    "startDate": q.checkin,
    "endDate": q.checkout,
    adults: String(q.guests),
  });
  return `https://www.vrbo.com/pt-br/busca/keywords:${encodeURIComponent(q.city)}?${params.toString()}`;
}

/** Expedia — hotéis e pacotes. */
function buildExpedia(q: StayQuery): string {
  const params = new URLSearchParams({
    destination: q.city,
    startDate: q.checkin,
    endDate: q.checkout,
    rooms: String(q.rooms),
    adults: String(q.guests),
  });
  return `https://www.expedia.com.br/Hotel-Search?${params.toString()}`;
}

/** Google Hotels — via busca de hotéis do Google (termo tolerante). */
function buildGoogleHotels(q: StayQuery): string {
  const params = new URLSearchParams({
    q: `Hotéis em ${q.city}`,
    hl: "pt-BR",
  });
  return `https://www.google.com/travel/search?${params.toString()}`;
}

/** TripAdvisor — busca de hospedagem por destino. */
function buildTripAdvisor(q: StayQuery): string {
  const params = new URLSearchParams({ q: q.city });
  return `https://www.tripadvisor.com.br/Search?${params.toString()}`;
}

/**
 * Gera as opções de HOSPEDAGEM (Airbnb, Booking, Hoteis.com, Trivago, Decolar,
 * Vrbo, Expedia, Google Hotels, TripAdvisor).
 */
export function buildStayLinks(q: StayQuery): ProviderLink[] {
  if (!q.city) return [];
  return [
    { id: "airbnb", name: "Airbnb", url: buildAirbnb(q), note: "Casas e apartamentos no destino." },
    { id: "booking", name: "Booking.com", url: buildBooking(q), note: "Hotéis e hospedagens." },
    { id: "hoteis", name: "Hoteis.com", url: buildHoteis(q), note: "Hotéis com programa de fidelidade." },
    { id: "trivago", name: "Trivago", url: buildTrivago(q), note: "Compare preços de hotéis." },
    { id: "decolar", name: "Decolar", url: buildDecolarHotel(q), note: "Hotéis e pacotes." },
    { id: "vrbo", name: "Vrbo", url: buildVrbo(q), note: "Casas de temporada." },
    { id: "expedia", name: "Expedia", url: buildExpedia(q), note: "Hotéis e pacotes internacionais." },
    { id: "google-hotels", name: "Google Hotels", url: buildGoogleHotels(q), note: "Compare no Google." },
    { id: "tripadvisor", name: "TripAdvisor", url: buildTripAdvisor(q), note: "Avaliações e preços." },
  ];
}
