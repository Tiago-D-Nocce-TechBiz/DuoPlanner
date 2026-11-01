/**
 * Motor de Busca — Deep Linking Outbound.
 *
 * O DuoPlanner NÃO executa pesquisa interna. A partir dos dados fornecidos pelo
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
  const o = slug(q.originCity);
  const d = slug(q.destinationCity);

  return [
    {
      id: "clickbus",
      name: "ClickBus",
      // Marketplace BR com rota no caminho: /onibus/<origem>/<destino>
      url: `https://www.clickbus.com.br/onibus/${o}/${d}`,
      note: "Maior marketplace de passagens rodoviárias do Brasil.",
    },
    {
      id: "buser",
      name: "Buser",
      url: `https://www.buser.com.br/onibus/${o}/${d}`,
      note: "Fretamento colaborativo e viações parceiras.",
    },
    {
      id: "deonibus",
      name: "DeÔnibus",
      url: `https://www.deonibus.com/onibus/${o}/${d}`,
      note: "Comparador de passagens rodoviárias.",
    },
    {
      id: "guanabara",
      name: "Expresso Guanabara",
      url: "https://www.expressoguanabara.com.br/",
      note: "Site oficial — Nordeste e ligações regionais.",
    },
    {
      id: "util",
      name: "Viação UTIL",
      url: "https://www.util.com.br/",
      note: "Site oficial — Sudeste e Centro-Oeste.",
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

/*
 * Estratégia de links (importante):
 * - METABUSCADORES (Google Flights, Skyscanner) e marketplaces (Decolar) têm
 *   formato de deep link estável → geramos a busca PRÉ-PREENCHIDA de verdade.
 * - COMPANHIAS AÉREAS (LATAM, Azul, GOL) não expõem um deep link público e
 *   estável que preencha a busca sem quebrar; forçar parâmetros internos leva a
 *   páginas de erro. Para essas, abrimos a PÁGINA OFICIAL de voos (confiável),
 *   onde o usuário confirma a rota. É mais honesto do que prometer
 *   pré-preenchimento e entregar link quebrado.
 * Apenas empresas confiáveis com operação no Brasil.
 */

/**
 * Google Flights — deep link por rota/datas no caminho (#flt=), formato
 * estável e tolerante que abre a busca montada.
 */
function buildGoogleFlights(q: FlightQuery): string {
  const o = q.originIata.toUpperCase();
  const d = q.destinationIata.toUpperCase();
  // Ex.: GRU.GIG.2026-12-10*GIG.GRU.2026-12-20
  let flt = `${o}.${d}.${q.departDate}`;
  if (q.tripType === "round" && q.returnDate) {
    flt += `*${d}.${o}.${q.returnDate}`;
  }
  const seat = q.cabin === "economy" ? "" : ";c:" + q.cabin.toUpperCase();
  // "tt:o" marca só ida; ida e volta é o padrão quando há os dois trechos.
  const soIda = !(q.tripType === "round" && q.returnDate);
  return `https://www.google.com/travel/flights?hl=pt-BR#flt=${flt}${seat}${soIda ? ";tt:o" : ""}`;
}

/**
 * Skyscanner (BR) — padrão de rota por path:
 * /transporte/passagens-aereas/<orig>/<dest>/<aammdd>/<aammdd>/?adults=&cabinclass=
 * Formato público e estável do metabuscador.
 */
function buildSkyscanner(q: FlightQuery): string {
  const aammdd = (iso: string) => iso.replaceAll("-", "").slice(2); // aammdd
  const o = q.originIata.toLowerCase();
  const d = q.destinationIata.toLowerCase();
  const out = aammdd(q.departDate);
  const back =
    q.tripType === "round" && q.returnDate ? `/${aammdd(q.returnDate)}` : "";
  const params = new URLSearchParams({
    adults: String(q.passengers),
    cabinclass: q.cabin,
    rtn: q.tripType === "round" ? "1" : "0",
  });
  return `https://www.skyscanner.com.br/transporte/passagens-aereas/${o}/${d}/${out}${back}/?${params.toString()}`;
}

/** Decolar — marketplace BR. Busca de voos por rota/datas no caminho. */
function buildDecolarVoo(q: FlightQuery): string {
  const o = q.originIata.toUpperCase();
  const d = q.destinationIata.toUpperCase();
  const volta = q.tripType === "round" && q.returnDate ? q.returnDate : q.departDate;
  // Caminho de resultados da Decolar (roundtrip/oneway) com datas e ocupação.
  const tipo = q.tripType === "round" ? "roundtrip" : "oneway";
  const base = q.tripType === "round"
    ? `${tipo}/${o}/${d}/${q.departDate}/${volta}`
    : `${tipo}/${o}/${d}/${q.departDate}`;
  return `https://www.decolar.com/shop/flights/results/${base}/${q.passengers}/0/0?from=SB`;
}

/** LATAM — página oficial de voos (BR). Confiável; o usuário confirma a rota. */
function buildLatamOficial(): string {
  return "https://www.latamairlines.com/br/pt";
}

/** Azul — página oficial de passagens (BR). */
function buildAzulOficial(): string {
  return "https://www.voeazul.com.br/";
}

/** GOL — página oficial de voos (BR). */
function buildGolOficial(): string {
  return "https://www.voegol.com.br/";
}

/** Gera as opções de VOO. Metabuscadores pré-preenchidos + cias oficiais. */
export function buildFlightLinks(q: FlightQuery): ProviderLink[] {
  if (!q.originIata || !q.destinationIata) return [];
  return [
    {
      id: "google-flights",
      name: "Google Flights",
      url: buildGoogleFlights(q),
      note: "Busca pré-preenchida · compara todas as companhias.",
    },
    {
      id: "skyscanner",
      name: "Skyscanner",
      url: buildSkyscanner(q),
      note: "Busca pré-preenchida · metabusca de passagens.",
    },
    {
      id: "decolar",
      name: "Decolar",
      url: buildDecolarVoo(q),
      note: "Busca pré-preenchida · marketplace brasileiro.",
    },
    {
      id: "latam",
      name: "LATAM",
      url: buildLatamOficial(),
      note: "Site oficial da companhia — confirme a rota na busca.",
    },
    {
      id: "azul",
      name: "Azul",
      url: buildAzulOficial(),
      note: "Site oficial da companhia — confirme a rota na busca.",
    },
    {
      id: "gol",
      name: "GOL",
      url: buildGolOficial(),
      note: "Site oficial da companhia — confirme a rota na busca.",
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

/**
 * Booking.com — formato público e estável, amplamente usado:
 * /searchresults.pt-br.html?ss=&checkin=&checkout=&group_adults=&no_rooms=
 * Abre a busca totalmente pré-preenchida.
 */
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

/** Airbnb (BR) — /s/<Cidade>/homes com datas e hóspedes. Deep link estável. */
function buildAirbnb(q: StayQuery): string {
  const city = encodeURIComponent(q.city);
  const params = new URLSearchParams({
    checkin: q.checkin,
    checkout: q.checkout,
    adults: String(q.guests),
  });
  return `https://www.airbnb.com.br/s/${city}/homes?${params.toString()}`;
}

/** Trivago (BR) — metabusca por termo de destino (busca já aberta no destino). */
function buildTrivago(q: StayQuery): string {
  const params = new URLSearchParams({ query: q.city });
  return `https://www.trivago.com.br/pt-BR/srl?${params.toString()}`;
}

/** Decolar — hospedagem por destino (marketplace BR). */
function buildDecolarHotel(q: StayQuery): string {
  const params = new URLSearchParams({
    checkin: q.checkin,
    checkout: q.checkout,
    rooms: String(q.rooms),
    adults: String(q.guests),
  });
  return `https://www.decolar.com/hoteis/pesquisa/${encodeURIComponent(q.city)}?${params.toString()}`;
}

/** Google Hotels — busca de hotéis no destino (termo tolerante e estável). */
function buildGoogleHotels(q: StayQuery): string {
  const params = new URLSearchParams({ q: `Hotéis em ${q.city}`, hl: "pt-BR" });
  return `https://www.google.com/travel/search?${params.toString()}`;
}

/**
 * Gera as opções de HOSPEDAGEM. Prioriza plataformas confiáveis com operação no
 * Brasil e deep link pré-preenchido (Booking, Airbnb, Decolar), além de
 * metabuscadores (Trivago, Google Hotels).
 */
export function buildStayLinks(q: StayQuery): ProviderLink[] {
  if (!q.city) return [];
  return [
    { id: "booking", name: "Booking.com", url: buildBooking(q), note: "Busca pré-preenchida · hotéis e pousadas." },
    { id: "airbnb", name: "Airbnb", url: buildAirbnb(q), note: "Busca pré-preenchida · casas e apartamentos." },
    { id: "decolar", name: "Decolar", url: buildDecolarHotel(q), note: "Busca pré-preenchida · marketplace brasileiro." },
    { id: "trivago", name: "Trivago", url: buildTrivago(q), note: "Compara preços de hotéis no destino." },
    { id: "google-hotels", name: "Google Hotels", url: buildGoogleHotels(q), note: "Compara hospedagens no Google." },
  ];
}
