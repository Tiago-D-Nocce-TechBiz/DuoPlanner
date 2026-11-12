import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyFlightPreferences, flightSearchSchema, searchFlights, type FlightSearchInput } from "./kiwi";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

/**
 * Cenários da Kiwi.com (Tequila) com `fetch` simulado. Vieram do antigo
 * servidor de mocks dos testes E2E (.tmp-e2e/mocks.mjs), agora sem processo
 * nem porta: o mesmo conjunto de itinerários exercita filtros, combinação
 * low-cost, link anti-phishing e erros do provedor.
 */

const DIA = "2026-12-10";
const PROXIMO = "2026-12-11";
const VOLTA = "2026-12-17";
const T = (data: string, hm: string) => `${data}T${hm}:00.000Z`;

/** Trecho no formato da Tequila; o horário UTC sai do local + fuso (horas). */
function trecho(
  [flyFrom, cityFrom]: [string, string],
  [flyTo, cityTo]: [string, string],
  [partida, fusoPartida]: [string, number],
  [chegada, fusoChegada]: [string, number],
  voo: string,
  volta: 0 | 1,
  redespacho = false
) {
  const utc = (local: string, fuso: number) => new Date(Date.parse(local) - fuso * 3_600_000).toISOString();
  return {
    flyFrom,
    flyTo,
    cityFrom,
    cityTo,
    local_departure: partida,
    local_arrival: chegada,
    utc_departure: utc(partida, fusoPartida),
    utc_arrival: utc(chegada, fusoChegada),
    airline: voo.slice(0, 2),
    flight_no: Number(voo.slice(2)),
    return: volta,
    bags_recheck_required: redespacho,
  };
}

const GRU: [string, string] = ["GRU", "São Paulo"];
const LIS: [string, string] = ["LIS", "Lisboa"];
const volta = trecho(LIS, GRU, [T(VOLTA, "11:30"), 0], [T(VOLTA, "18:55"), -3], "TP87", 1);

const ITINERARIOS = [
  {
    // o mais barato, mas com escala de 14 h em Santiago
    id: "it-longa",
    price: 2500,
    airlines: ["LA"],
    nightsInDest: 7,
    duration: { departure: 30 * 3600, return: 12 * 3600 },
    deep_link: "https://www.kiwi.com/deep?it=longa",
    availability: { seats: 3 },
    virtual_interlining: false,
    route: [
      trecho(GRU, ["SCL", "Santiago"], [T(DIA, "06:00"), -3], [T(DIA, "09:30"), -3], "LA702", 0),
      trecho(["SCL", "Santiago"], LIS, [T(DIA, "23:30"), -3], [T(PROXIMO, "17:00"), 0], "LA98", 0),
      trecho(LIS, GRU, [T(VOLTA, "10:00"), 0], [T(VOLTA, "19:00"), -3], "LA99", 1),
    ],
  },
  {
    // combinação Kiwi (Air Europa + Ryanair): escala de 3 h, bagagem redespachada
    id: "it-combo",
    price: 2980,
    airlines: ["UX", "FR"],
    nightsInDest: 7,
    duration: { departure: 14 * 3600 + 50 * 60, return: 10 * 3600 + 25 * 60 },
    deep_link: "https://www.kiwi.com/deep?it=combo",
    availability: { seats: 9 },
    virtual_interlining: true,
    route: [
      trecho(GRU, ["MAD", "Madri"], [T(DIA, "16:05"), -3], [T(PROXIMO, "06:10"), 1], "UX58", 0),
      trecho(["MAD", "Madri"], LIS, [T(PROXIMO, "09:10"), 1], [T(PROXIMO, "09:55"), 0], "FR5432", 0, true),
      volta,
    ],
  },
  {
    // duas escalas na ida e link de phishing
    id: "it-duas",
    price: 2700,
    airlines: ["AD", "TP"],
    nightsInDest: 7,
    duration: { departure: 18 * 3600, return: 10 * 3600 },
    deep_link: "https://evil.example.com/phish",
    route: [
      trecho(GRU, ["REC", "Recife"], [T(DIA, "05:00"), -3], [T(DIA, "08:20"), -3], "AD4050", 0),
      trecho(["REC", "Recife"], ["FOR", "Fortaleza"], [T(DIA, "09:30"), -3], [T(DIA, "10:40"), -3], "AD4080", 0),
      trecho(["FOR", "Fortaleza"], LIS, [T(DIA, "13:00"), -3], [T(DIA, "23:00"), 0], "TP12", 0),
      volta,
    ],
  },
  {
    // direto: o mais caro e o mais rápido
    id: "it-direto",
    price: 4200,
    airlines: ["TP"],
    nightsInDest: 7,
    duration: { departure: 10 * 3600 + 5 * 60, return: 10 * 3600 + 25 * 60 },
    deep_link: "https://www.kiwi.com/deep?it=direto",
    availability: { seats: 2 },
    route: [trecho(GRU, LIS, [T(DIA, "17:45"), -3], [T(PROXIMO, "06:50"), 0], "TP82", 0), volta],
  },
  { id: "quebrado" },
];

function futuro(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}

function consulta(extra: Record<string, string> = {}): FlightSearchInput {
  return flightSearchSchema.parse({ from: "GRU", to: "LIS", dateFrom: futuro(40), nightsFrom: "7", ...extra });
}

function resposta(corpo: unknown, status = 200): Response {
  return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchSimulado: ReturnType<typeof vi.fn>;

function responder(fabrica: () => Response | Promise<Response>) {
  fetchSimulado = vi.fn(async () => fabrica());
  vi.stubGlobal("fetch", fetchSimulado);
}

function urlChamada(): URL {
  return new URL(String(fetchSimulado.mock.calls[0][0]));
}

beforeEach(() => {
  vi.stubEnv("KIWI_API_KEY", "test-kiwi-key");
  vi.stubEnv("KIWI_API_BASE_URL", "https://kiwi.teste");
  responder(() => resposta({ currency: "BRL", data: ITINERARIOS }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function buscar(q: FlightSearchInput) {
  const r = await searchFlights(q, []);
  if (!r.ok) throw new Error(`esperava sucesso: ${r.status} ${r.message}`);
  return r.data;
}

describe("searchFlights: normalização", () => {
  it("normaliza os itinerários válidos e ignora o malformado", async () => {
    const r = await buscar(consulta());
    expect(r.offers.map((o) => o.id)).toEqual(["it-longa", "it-combo", "it-duas", "it-direto"]);
    expect(r.totalFound).toBe(4);
    expect(r.cheapestId).toBe("it-longa");
    expect(r.fastestId).toBe("it-direto");
    expect(r.offers.find((o) => o.id === "it-longa")?.pricePerPerson).toBe(1250);
  });

  it("combinação low-cost: escala pelo horário UTC, redespacho e companhias", async () => {
    const combo = (await buscar(consulta())).offers.find((o) => o.id === "it-combo")!;
    expect(combo.isKiwiCombo).toBe(true);
    expect(combo.bagsRecheck).toBe(true);
    expect(combo.lowCost).toBe(true);
    expect(combo.airlines).toEqual([
      { code: "UX", name: "Air Europa", lowCost: false },
      { code: "FR", name: "Ryanair", lowCost: true },
    ]);
    // Chega 06:10 em Madri (UTC+1) e sai 09:10 (UTC+1): 3 h, não 3 h + fuso.
    expect(combo.outbound.layovers).toEqual([{ airport: "MAD", city: "Madri", minutes: 180 }]);
    expect(combo.outbound.durationMinutes).toBe(890);
    expect(combo.inbound?.durationMinutes).toBe(625);
    expect(combo.totalDurationMinutes).toBe(1515);
    expect(combo.outbound.segments.map((s) => s.flightNumber)).toEqual(["UX58", "FR5432"]);
  });

  it("link que não é da Kiwi nunca chega à tela (anti-phishing)", async () => {
    const r = await buscar(consulta());
    expect(r.offers.find((o) => o.id === "it-duas")?.bookingUrl).toBeNull();
    expect(r.offers.find((o) => o.id === "it-direto")?.bookingUrl).toBe("https://www.kiwi.com/deep?it=direto");
  });
});

describe("searchFlights: filtros e orçamento", () => {
  it("escala longa e excesso de escalas saem, mesmo que a Kiwi os devolva", async () => {
    const r = await buscar(consulta({ maxStopovers: "1", maxLayoverHours: "4" }));
    expect(r.offers.map((o) => o.id)).toEqual(["it-combo", "it-direto"]);
    expect(r.cheapestId).toBe("it-combo");
    expect(urlChamada().searchParams.get("max_sector_stopovers")).toBe("1");
    expect(urlChamada().searchParams.get("stopover_to")).toBe("04:00");
  });

  it("preferências da memória preenchem só o que a busca não informou", async () => {
    const { query, applied } = applyFlightPreferences(consulta(), { max_escalas: 1, max_duracao_escala_horas: 4 });
    expect(applied).toHaveLength(2);
    expect((await buscar(query)).offers.map((o) => o.id)).toEqual(["it-combo", "it-direto"]);

    const explicita = applyFlightPreferences(consulta({ maxStopovers: "0" }), { max_escalas: 1 });
    expect(explicita.query.maxStopovers).toBe(0);
    expect(explicita.applied).toEqual([]);
  });

  it("orçamento: mostra o que cabe; se nada cabe, os mais próximos com aviso", async () => {
    const cabe = await buscar(consulta({ maxStopovers: "1", maxLayoverHours: "4", budget: "3000" }));
    expect(cabe.offers.map((o) => [o.id, o.withinBudget])).toEqual([["it-combo", true]]);
    expect(cabe.budgetNotice).toBeNull();

    const nada = await buscar(consulta({ maxStopovers: "1", maxLayoverHours: "4", budget: "1000" }));
    expect(nada.offers.map((o) => [o.id, o.withinBudget])).toEqual([
      ["it-combo", false],
      ["it-direto", false],
    ]);
    expect(nada.budgetNotice).toMatch(/orçamento de R\$\s?1\.000,00/);
  });
});

describe("searchFlights: consulta à Tequila", () => {
  it("datas dd/mm/aaaa, noites na volta, cabine e chave no cabeçalho", async () => {
    const q = consulta({ dateFrom: futuro(40), dateTo: futuro(45) });
    await buscar(q);
    const url = urlChamada();
    const [ano, mes, dia] = q.dateFrom.split("-");
    expect(url.origin + url.pathname).toBe("https://kiwi.teste/v2/search");
    expect(url.searchParams.get("date_from")).toBe(`${dia}/${mes}/${ano}`);
    expect(url.searchParams.get("flight_type")).toBe("round");
    expect(url.searchParams.get("nights_in_dst_from")).toBe("7");
    expect(url.searchParams.get("nights_in_dst_to")).toBe("10");
    expect(url.searchParams.get("selected_cabins")).toBe("M");
    expect(url.searchParams.get("curr")).toBe("BRL");
    const init = fetchSimulado.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).apikey).toBe("test-kiwi-key");
  });

  it("só ida: sem parâmetros de noites", async () => {
    await buscar(consulta({ tripType: "oneway" }));
    expect(urlChamada().searchParams.has("nights_in_dst_from")).toBe(false);
  });
});

describe("searchFlights: falhas viram resultado, nunca exceção", () => {
  it("sem KIWI_API_KEY: 503 e nenhuma chamada paga", async () => {
    vi.stubEnv("KIWI_API_KEY", "");
    expect(await searchFlights(consulta(), [])).toEqual({ ok: false, status: 503, message: "KIWI_API_KEY não configurada." });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("chave recusada: repassa o status e a mensagem do provedor", async () => {
    responder(() => resposta({ error_code: 401, message: "Unauthorized" }, 401));
    expect(await searchFlights(consulta(), [])).toEqual({ ok: false, status: 401, message: "Unauthorized" });
  });

  it("erro sem corpo JSON e corpo fora do formato", async () => {
    responder(() => resposta("<html>erro</html>", 500));
    expect(await searchFlights(consulta(), [])).toMatchObject({ status: 500, message: "Kiwi.com respondeu 500." });
    responder(() => resposta({ data: "inesperado" }));
    expect(await searchFlights(consulta(), [])).toMatchObject({ status: 502, message: "Resposta inesperada da Kiwi.com." });
  });

  it("tempo esgotado e rede fora", async () => {
    responder(() => Promise.reject(Object.assign(new Error("expirou"), { name: "TimeoutError" })));
    expect(await searchFlights(consulta(), [])).toMatchObject({ status: 504 });
    responder(() => Promise.reject(new TypeError("fetch failed")));
    expect(await searchFlights(consulta(), [])).toMatchObject({ status: 502, message: "Não foi possível falar com a Kiwi.com." });
  });
});
