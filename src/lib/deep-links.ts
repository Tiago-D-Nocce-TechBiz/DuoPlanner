/**
 * Motor de Busca — Deep Linking Outbound.
 *
 * O PlannerDuo NÃO executa pesquisa interna. Em vez disso, a partir dos dados
 * fornecidos pelo utilizador (origem, destino, datas e passageiros), gera URLs
 * de pesquisa pré-preenchidas para plataformas parceiras e abre-as num novo
 * separador.
 *
 * IMPORTANTE (decisão de engenharia):
 * As estruturas de URL e os query parameters dos sites externos mudam com
 * frequência e não são contratos públicos estáveis. Centralizamos aqui a
 * construção dos links para que, quando um parceiro alterar o seu formato,
 * exista um único ponto de manutenção. Cada builder documenta os parâmetros
 * usados. Os parâmetros são sempre codificados com encodeURIComponent via
 * URLSearchParams para evitar injeção/quebra de URL.
 */

export type TripType = "round" | "oneway";

export interface SearchQuery {
  /** Texto livre de origem (cidade) — usado por estadias (Airbnb/Booking). */
  originCity?: string;
  /** Texto livre de destino (cidade) — usado por estadias e voos. */
  destinationCity: string;
  /** Código IATA de origem (ex.: LIS, GRU) — usado por companhias aéreas. */
  originIata?: string;
  /** Código IATA de destino (ex.: OPO, GIG) — usado por companhias aéreas. */
  destinationIata?: string;
  /** Data de ida no formato ISO yyyy-mm-dd. */
  departDate: string;
  /** Data de volta no formato ISO yyyy-mm-dd (ignorada se oneway). */
  returnDate?: string;
  /** Tipo de viagem. */
  tripType: TripType;
  /** Número de adultos. */
  adults: number;
  /** Número de crianças. */
  children: number;
}

export type ProviderCategory = "stay" | "flight";

export interface ProviderLink {
  id: string;
  name: string;
  category: ProviderCategory;
  /** URL final pré-preenchida para abrir em novo separador. */
  url: string;
  /** Pequena nota sobre o que o link abre. */
  note: string;
}

/* --------------------------------- ESTADIAS -------------------------------- */

/**
 * Airbnb — pesquisa por destino com janela de datas e hóspedes.
 * Formato: /s/<Destino>/homes?checkin=&checkout=&adults=&children=
 */
function buildAirbnb(q: SearchQuery): string {
  const dest = encodeURIComponent(q.destinationCity || "");
  const params = new URLSearchParams({
    refinement_paths: "/homes",
    checkin: q.departDate,
    checkout: q.returnDate || q.departDate,
    adults: String(q.adults),
    children: String(q.children),
  });
  return `https://www.airbnb.com/s/${dest}/homes?${params.toString()}`;
}

/**
 * Booking.com — pesquisa de alojamento.
 * Formato: /searchresults.html?ss=<Destino>&checkin=&checkout=&group_adults=&group_children=
 */
function buildBooking(q: SearchQuery): string {
  const params = new URLSearchParams({
    ss: q.destinationCity || "",
    checkin: q.departDate,
    checkout: q.returnDate || q.departDate,
    group_adults: String(q.adults),
    group_children: String(q.children),
    no_rooms: "1",
  });
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

/* ---------------------------------- VOOS ----------------------------------- */

/**
 * LATAM — motor de ofertas de voos.
 * Formato observado: /br/pt/oferta-voos?origin=&destination=&outbound=&inbound=&adt=&chd=&trip=
 * As datas usam ISO com sufixo de meia-noite UTC.
 */
function buildLatam(q: SearchQuery): string {
  const outbound = `${q.departDate}T00:00:00.000Z`;
  const inbound =
    q.tripType === "round" && q.returnDate
      ? `${q.returnDate}T00:00:00.000Z`
      : "";
  const params = new URLSearchParams({
    origin: q.originIata || "",
    destination: q.destinationIata || "",
    outbound,
    adt: String(q.adults),
    chd: String(q.children),
    inf: "0",
    trip: q.tripType === "round" ? "RT" : "OW",
    cabin: "Economy",
    redemption: "false",
    sort: "RECOMMENDED",
  });
  if (inbound) params.set("inbound", inbound);
  return `https://www.latamairlines.com/br/pt/oferta-voos?${params.toString()}`;
}

/**
 * Azul — portal de passagens.
 * Formato aproximado do booking: parâmetros de origem/destino/datas e tipo de viagem.
 * Nota: a Azul usa um fluxo de reserva (TripFlow); mantemos os parâmetros mais
 * estáveis (origin, destination, datas, passageiros).
 */
function buildAzul(q: SearchQuery): string {
  const params = new URLSearchParams({
    c: "pt-BR",
    o1: q.originIata || "",
    d1: q.destinationIata || "",
    dd1: q.departDate,
    r: q.tripType === "round" ? "true" : "false",
    ADT: String(q.adults),
    CHD: String(q.children),
    INF: "0",
    mon: "true",
  });
  if (q.tripType === "round" && q.returnDate) {
    params.set("dd2", q.returnDate);
  }
  return `https://reservas.voeazul.com.br/Flight/Select?${params.toString()}`;
}

/**
 * GOL — portal de voos.
 * Formato aproximado: origem/destino IATA, datas e passageiros.
 */
function buildGol(q: SearchQuery): string {
  const params = new URLSearchParams({
    origin: q.originIata || "",
    destination: q.destinationIata || "",
    departureDate: q.departDate,
    adults: String(q.adults),
    children: String(q.children),
    infants: "0",
    tripType: q.tripType === "round" ? "RT" : "OW",
  });
  if (q.tripType === "round" && q.returnDate) {
    params.set("returnDate", q.returnDate);
  }
  return `https://b2c.voegol.com.br/compra/busca-de-voos?${params.toString()}`;
}

/**
 * Gera todas as opções clicáveis a partir de uma pesquisa.
 * Estadias dependem do nome da cidade; voos dependem dos códigos IATA.
 */
export function buildProviderLinks(q: SearchQuery): ProviderLink[] {
  const links: ProviderLink[] = [];

  // Hospedagens — requerem cidade de destino
  if (q.destinationCity) {
    links.push({
      id: "airbnb",
      name: "Airbnb",
      category: "stay",
      url: buildAirbnb(q),
      note: "Hospedagens em casas e apartamentos no destino.",
    });
    links.push({
      id: "booking",
      name: "Booking.com",
      category: "stay",
      url: buildBooking(q),
      note: "Hotéis e hospedagens com as suas datas.",
    });
  }

  // Voos — requerem códigos IATA de origem e destino
  if (q.originIata && q.destinationIata) {
    links.push({
      id: "latam",
      name: "LATAM",
      category: "flight",
      url: buildLatam(q),
      note: "Voos LATAM pré-preenchidos.",
    });
    links.push({
      id: "azul",
      name: "Azul",
      category: "flight",
      url: buildAzul(q),
      note: "Voos Azul pré-preenchidos.",
    });
    links.push({
      id: "gol",
      name: "GOL",
      category: "flight",
      url: buildGol(q),
      note: "Voos GOL pré-preenchidos.",
    });
  }

  return links;
}
