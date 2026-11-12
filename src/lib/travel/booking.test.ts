import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyHotelPreferences, hotelSearchSchema, searchHotels, type HotelSearchInput } from "./booking";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

/**
 * Cenários da Booking.com (RapidAPI "Booking.com15") com `fetch` simulado.
 * Vieram do antigo servidor de mocks dos testes E2E (.tmp-e2e/mocks.mjs):
 * destino ambíguo (bairro × cidade), taxas fora do preço, preço riscado,
 * propriedade esgotada e anúncio novo sem avaliações.
 */

interface Extra {
  estrelas?: number;
  riscado?: number;
  taxasFora?: number;
  foto?: string;
}

function hotel(id: number, nome: string, nota: number, avaliacoes: number, bruto: number | null, extra: Extra = {}) {
  return {
    hotel_id: id,
    accessibilityLabel: nome,
    property: {
      name: nome,
      reviewScore: nota,
      reviewScoreWord: nota >= 9 ? "Excelente" : nota >= 8 ? "Muito bom" : nota ? "Bom" : "",
      reviewCount: avaliacoes,
      propertyClass: extra.estrelas ?? 3,
      accuratePropertyClass: extra.estrelas ?? 3,
      photoUrls: [extra.foto ?? `https://cf.bstatic.com/xdata/images/hotel/square60/${id}.jpg?k=abc&o=`],
      checkin: { fromTime: "15:00", untilTime: "23:00" },
      checkout: { fromTime: "07:00", untilTime: "11:00" },
      priceBreakdown:
        bruto === null
          ? undefined
          : {
              grossPrice: { value: bruto, currency: "BRL" },
              ...(extra.taxasFora ? { excludedPrice: { value: extra.taxasFora, currency: "BRL" } } : {}),
              ...(extra.riscado ? { strikethroughPrice: { value: extra.riscado, currency: "BRL" } } : {}),
            },
    },
  };
}

const DESTINOS = {
  status: true,
  message: "Success",
  data: [
    { dest_id: "123", search_type: "district", dest_type: "district", name: "Alfama", label: "Alfama, Lisboa" },
    { dest_id: -2167973, search_type: "city", dest_type: "city", name: "Lisboa", label: "Lisboa, Portugal", country: "Portugal" },
  ],
};

const HOTEIS = {
  status: true,
  message: "Success",
  data: {
    hotels: [
      hotel(1, "Grande Hotel Luxo", 9.6, 2500, 6500, { estrelas: 5, riscado: 7200 }),
      hotel(2, "Casa do Bairro", 9.2, 1800, 2100, { estrelas: 4, taxasFora: 60 }),
      hotel(3, "Hostel Barato", 7.1, 300, 900, { estrelas: 2 }),
      hotel(4, "Novo Apartamento", 0, 0, 1000, { estrelas: 0, foto: "https://evil.example.com/foto.jpg" }),
      hotel(5, "Esgotado Palace", 8.8, 900, null),
    ],
  },
};

function futuro(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}

function consulta(extra: Record<string, string> = {}): HotelSearchInput {
  return hotelSearchSchema.parse({ city: "Lisboa", checkin: futuro(30), checkout: futuro(35), ...extra });
}

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

type Rotas = { destino?: () => Response; hoteis?: () => Response };
let fetchSimulado: ReturnType<typeof vi.fn>;

function responder(rotas: Rotas = {}) {
  fetchSimulado = vi.fn(async (entrada: string | URL) => {
    const url = new URL(String(entrada));
    if (url.pathname === "/api/v1/hotels/searchDestination") return (rotas.destino ?? (() => resposta(DESTINOS)))();
    if (url.pathname === "/api/v1/hotels/searchHotels") return (rotas.hoteis ?? (() => resposta(HOTEIS)))();
    return resposta({ message: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchSimulado);
}

function chamada(caminho: string): { url: URL; headers: Record<string, string> } {
  const encontrada = fetchSimulado.mock.calls.find(([u]) => new URL(String(u)).pathname === caminho);
  if (!encontrada) throw new Error(`sem chamada a ${caminho}`);
  return { url: new URL(String(encontrada[0])), headers: (encontrada[1] as RequestInit).headers as Record<string, string> };
}

beforeEach(() => {
  vi.stubEnv("RAPIDAPI_KEY", "test-rapid-key");
  vi.stubEnv("RAPIDAPI_BOOKING_HOST", "booking.teste");
  responder();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function buscar(q: HotelSearchInput) {
  const r = await searchHotels(q, []);
  if (!r.ok) throw new Error(`esperava sucesso: ${r.status} ${r.message}`);
  return r.data;
}

describe("searchHotels: destino e normalização", () => {
  it("escolhe a cidade (não o bairro) e busca com o dest_id dela", async () => {
    const r = await buscar(consulta());
    expect(r.destination).toEqual({ name: "Lisboa", label: "Lisboa, Portugal", country: "Portugal" });
    const { url, headers } = chamada("/api/v1/hotels/searchHotels");
    expect(url.host).toBe("booking.teste");
    expect(url.searchParams.get("dest_id")).toBe("-2167973");
    expect(url.searchParams.get("search_type")).toBe("CITY");
    expect(url.searchParams.get("currency_code")).toBe("BRL");
    expect(headers["x-rapidapi-key"]).toBe("test-rapid-key");
    expect(headers["x-rapidapi-host"]).toBe("booking.teste");
  });

  it("propriedade esgotada (sem preço) sai; taxas cobradas à parte entram no total", async () => {
    const r = await buscar(consulta());
    expect(r.nights).toBe(5);
    expect(r.hotels.map((h) => h.name)).not.toContain("Esgotado Palace");
    expect(r.totalFound).toBe(4);
    const casa = r.hotels.find((h) => h.name === "Casa do Bairro")!;
    expect(casa.totalPrice).toBe(2160);
    expect(casa.pricePerNight).toBe(432);
    expect(casa.taxesIncluded).toBe(true);
  });

  it("preço riscado, estrelas, avaliação ausente e foto só do CDN da Booking", async () => {
    const r = await buscar(consulta());
    const luxo = r.hotels.find((h) => h.name === "Grande Hotel Luxo")!;
    expect(luxo.originalPrice).toBe(7200);
    expect(luxo.stars).toBe(5);
    expect(luxo.photoUrl).toBe("https://cf.bstatic.com/xdata/images/hotel/square240/1.jpg?k=abc&o=");
    const novo = r.hotels.find((h) => h.name === "Novo Apartamento")!;
    expect(novo.reviewScore).toBeNull();
    expect(novo.stars).toBeNull();
    expect(novo.originalPrice).toBeNull();
    expect(novo.photoUrl).toBeNull();
  });
});

describe("searchHotels: custo-benefício, nota mínima e orçamento", () => {
  it("nota bayesiana: anúncio sem avaliação não passa à frente de quem é bem avaliado", async () => {
    const r = await buscar(consulta());
    expect(r.hotels.map((h) => [h.name, h.valueScore])).toEqual([
      ["Casa do Bairro", 72],
      ["Hostel Barato", 63],
      ["Grande Hotel Luxo", 63],
      ["Novo Apartamento", 54],
    ]);
  });

  it("nota mínima vinda da memória filtra antes do ranking", async () => {
    const { query, applied } = applyHotelPreferences(consulta(), { nota_minima_hospedagem: 9 });
    expect(applied).toHaveLength(1);
    expect((await buscar(query)).hotels.map((h) => h.name)).toEqual(["Casa do Bairro", "Grande Hotel Luxo"]);
  });

  it("orçamento: o que cabe, ou as mais baratas com aviso", async () => {
    const cabe = await buscar(consulta({ budget: "2500" }));
    expect(cabe.hotels.map((h) => [h.name, h.withinBudget])).toEqual([
      ["Casa do Bairro", true],
      ["Hostel Barato", true],
      ["Novo Apartamento", true],
    ]);
    expect(cabe.budgetNotice).toBeNull();

    const nada = await buscar(consulta({ budget: "500" }));
    expect(nada.hotels.map((h) => h.totalPrice)).toEqual([900, 1000, 2160, 6500]);
    expect(nada.hotels.every((h) => h.withinBudget === false)).toBe(true);
    expect(nada.budgetNotice).toMatch(/orçamento de R\$\s?500,00/);
  });
});

describe("searchHotels: falhas viram resultado, nunca exceção", () => {
  it("sem RAPIDAPI_KEY: 503 e nenhuma chamada paga", async () => {
    vi.stubEnv("RAPIDAPI_KEY", "");
    expect(await searchHotels(consulta(), [])).toEqual({ ok: false, status: 503, message: "RAPIDAPI_KEY não configurada." });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("assinatura inativa (403) e limite do plano (429)", async () => {
    responder({ destino: () => resposta({ message: "You are not subscribed to this API." }, 403) });
    expect(await searchHotels(consulta(), [])).toMatchObject({
      status: 403,
      message: "A chave RapidAPI não tem assinatura ativa da API Booking.com15.",
    });
    responder({ hoteis: () => resposta({ message: "Too many requests" }, 429) });
    expect(await searchHotels(consulta(), [])).toMatchObject({ status: 429, message: "Limite de requisições do plano RapidAPI atingido." });
  });

  it("erro com HTTP 200 (status: false) e corpo fora do formato", async () => {
    responder({ hoteis: () => resposta({ status: false, message: "arrival_date inválida" }) });
    expect(await searchHotels(consulta(), [])).toMatchObject({ status: 502, message: "arrival_date inválida" });
    responder({ hoteis: () => resposta({ status: true, data: "inesperado" }) });
    expect(await searchHotels(consulta(), [])).toMatchObject({ status: 502, message: "Resposta inesperada da Booking.com." });
  });

  it("destino desconhecido", async () => {
    responder({ destino: () => resposta({ status: true, data: [] }) });
    expect(await searchHotels(consulta(), [])).toEqual({
      ok: false,
      status: 404,
      message: 'Destino "lisboa" não encontrado na Booking.com.',
    });
  });
});
