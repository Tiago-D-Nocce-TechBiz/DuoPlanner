// Mocks locais para testes E2E (Kiwi, Booking/RapidAPI, Gemini, Supabase PostgREST).
// Pasta temporária: removida após os testes.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

/* ------------------------------- Kiwi :4010 ------------------------------- */
function seg(flyFrom, flyTo, cityFrom, cityTo, depLocal, arrLocal, offsetFrom, offsetTo, airline, no, ret, recheck = false) {
  const utc = (local, offsetH) => new Date(Date.parse(local) - offsetH * 3600_000).toISOString();
  return {
    flyFrom, flyTo, cityFrom, cityTo,
    local_departure: depLocal, local_arrival: arrLocal,
    utc_departure: utc(depLocal, offsetFrom), utc_arrival: utc(arrLocal, offsetTo),
    airline, flight_no: no, return: ret, bags_recheck_required: recheck,
  };
}
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/v2/search") return send(res, 404, { message: "not found" });
    if (req.headers.apikey !== "test-kiwi-key") return send(res, 401, { error_code: 401, message: "Unauthorized" });
    log("KIWI", Object.fromEntries(url.searchParams));
    const [d, m, y] = url.searchParams.get("date_from").split("/");
    const day = `${y}-${m}-${d}`;
    const back = new Date(Date.parse(`${day}T00:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
    const T = (date, hm) => `${date}T${hm}:00.000Z`;
    const next = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
    const data = [
      { // mais barato, mas escala de 14h → deve sumir com maxLayoverHours=4
        id: "it-longa", price: 2500, airlines: ["LA"], nightsInDest: 7,
        duration: { departure: 30 * 3600, return: 12 * 3600 }, deep_link: "https://www.kiwi.com/deep?it=longa",
        availability: { seats: 3 }, virtual_interlining: false, has_airport_change: false,
        route: [
          seg("GRU", "SCL", "São Paulo", "Santiago", T(day, "06:00"), T(day, "09:30"), -3, -3, "LA", 702, 0),
          seg("SCL", "LIS", "Santiago", "Lisboa", T(day, "23:30"), T(next(day), "17:00"), -3, 0, "LA", 98, 0),
          seg("LIS", "GRU", "Lisboa", "São Paulo", T(back, "10:00"), T(back, "19:00"), 0, -3, "LA", 99, 1),
        ],
      },
      { // combinação Kiwi low-cost (UX + FR), escala de 3h, bagagem precisa ser redespachada
        id: "it-combo", price: 2980, airlines: ["UX", "FR"], nightsInDest: 7,
        duration: { departure: 14 * 3600 + 50 * 60, return: 10 * 3600 + 25 * 60 }, deep_link: "https://www.kiwi.com/deep?it=combo",
        availability: { seats: 9 }, virtual_interlining: true, has_airport_change: false,
        route: [
          seg("GRU", "MAD", "São Paulo", "Madri", T(day, "16:05"), T(next(day), "06:10"), -3, 1, "UX", 58, 0),
          seg("MAD", "LIS", "Madri", "Lisboa", T(next(day), "09:10"), T(next(day), "09:55"), 1, 0, "FR", 5432, 0, true),
          seg("LIS", "GRU", "Lisboa", "São Paulo", T(back, "11:30"), T(back, "18:55"), 0, -3, "TP", 87, 1),
        ],
      },
      { // 2 escalas na ida → deve sumir com maxStopovers=1
        id: "it-duas", price: 2700, airlines: ["AD", "TP"], nightsInDest: 7,
        duration: { departure: 18 * 3600, return: 10 * 3600 }, deep_link: "https://evil.example.com/phish",
        virtual_interlining: false,
        route: [
          seg("GRU", "REC", "São Paulo", "Recife", T(day, "05:00"), T(day, "08:20"), -3, -3, "AD", 4050, 0),
          seg("REC", "FOR", "Recife", "Fortaleza", T(day, "09:30"), T(day, "10:40"), -3, -3, "AD", 4080, 0),
          seg("FOR", "LIS", "Fortaleza", "Lisboa", T(day, "13:00"), T(day, "23:00"), -3, 0, "TP", 12, 0),
          seg("LIS", "GRU", "Lisboa", "São Paulo", T(back, "11:30"), T(back, "18:55"), 0, -3, "TP", 87, 1),
        ],
      },
      { // direto, mais caro e mais rápido
        id: "it-direto", price: 4200, airlines: ["TP"], nightsInDest: 7,
        duration: { departure: 10 * 3600 + 5 * 60, return: 10 * 3600 + 25 * 60 }, deep_link: "https://www.kiwi.com/deep?it=direto",
        availability: { seats: 2 }, virtual_interlining: false,
        route: [
          seg("GRU", "LIS", "São Paulo", "Lisboa", T(day, "17:45"), T(next(day), "06:50"), -3, 0, "TP", 82, 0),
          seg("LIS", "GRU", "Lisboa", "São Paulo", T(back, "11:30"), T(back, "18:55"), 0, -3, "TP", 87, 1),
        ],
      },
      { id: "quebrado" }, // item inválido deve ser ignorado
    ];
    send(res, 200, { currency: "BRL", search_id: "mock", data, _results: data.length });
  })
  .listen(4010, () => log("kiwi mock :4010"));

/* --------------------------- Booking (https) :4443 --------------------------- */
const tls = { key: fs.readFileSync(new URL("./key.pem", import.meta.url)), cert: fs.readFileSync(new URL("./cert.pem", import.meta.url)) };
const hotel = (id, name, score, count, gross, extra = {}) => ({
  hotel_id: id,
  accessibilityLabel: name,
  property: {
    name, reviewScore: score, reviewScoreWord: score >= 9 ? "Excelente" : score >= 8 ? "Muito bom" : score ? "Bom" : "", reviewCount: count,
    propertyClass: extra.stars ?? 3, accuratePropertyClass: extra.stars ?? 3,
    photoUrls: [`https://cf.bstatic.com/xdata/images/hotel/square60/${id}.jpg?k=abc&o=`],
    checkin: { fromTime: "15:00", untilTime: "23:00" }, checkout: { fromTime: "07:00", untilTime: "11:00" },
    priceBreakdown: gross === null ? undefined : {
      grossPrice: { value: gross, currency: "BRL" },
      ...(extra.excluded ? { excludedPrice: { value: extra.excluded, currency: "BRL" } } : {}),
      ...(extra.strike ? { strikethroughPrice: { value: extra.strike, currency: "BRL" } } : {}),
    },
  },
});
https
  .createServer(tls, (req, res) => {
    const url = new URL(req.url, "https://localhost");
    if (req.headers["x-rapidapi-key"] !== "test-rapid-key") return send(res, 403, { message: "You are not subscribed to this API." });
    log("BOOKING", url.pathname, Object.fromEntries(url.searchParams));
    if (url.pathname === "/api/v1/hotels/searchDestination") {
      return send(res, 200, { status: true, message: "Success", data: [
        { dest_id: "123", search_type: "district", dest_type: "district", name: "Alfama", label: "Alfama, Lisboa" },
        { dest_id: -2167973, search_type: "city", dest_type: "city", name: "Lisboa", label: "Lisboa, Portugal", country: "Portugal" },
      ] });
    }
    if (url.pathname === "/api/v1/hotels/searchHotels") {
      return send(res, 200, { status: true, message: "Success", data: { hotels: [
        hotel(1, "Grande Hotel Luxo", 9.6, 2500, 6500, { stars: 5, strike: 7200 }),
        hotel(2, "Casa do Bairro", 9.2, 1800, 2100, { stars: 4, excluded: 60 }),
        hotel(3, "Hostel Barato", 7.1, 300, 900, { stars: 2 }),
        hotel(4, "Novo Apartamento", 0, 0, 1000, { stars: 0 }),
        hotel(5, "Esgotado Palace", 8.8, 900, null),
      ], meta: [{ title: "5 propriedades" }] } });
    }
    send(res, 404, { message: "not found" });
  })
  .listen(4443, () => log("booking mock :4443"));

/* ------------------------------- Gemini :4020 ------------------------------- */
http
  .createServer(async (req, res) => {
    const body = JSON.parse((await readBody(req)) || "{}");
    const props = Object.keys(body.generationConfig?.responseJsonSchema?.properties ?? {});
    const parts = (body.contents ?? []).flatMap((c) => c.parts ?? []);
    const media = parts.filter((p) => p.inlineData).map((p) => `${p.inlineData.mimeType}:${p.inlineData.data.length}b64`);
    log("GEMINI", req.url, "key:", req.headers["x-goog-api-key"], "schema:", props.join(","), "media:", media.join(" ") || "-",
      "thinking:", JSON.stringify(body.generationConfig?.thinkingConfig));
    let out;
    if (props.includes("legivel")) {
      out = { legivel: true, titulo: "Jantar — Taberna da Rua das Flores", valor: 186.4, data: "2026-10-27", moeda: "eur" };
    } else if (props.includes("experiencias")) {
      const text = parts.map((p) => p.text ?? "").join("\n");
      log("GEMINI gems prompt:", text.replace(/\n/g, " | "));
      out = { experiencias: [
        { nome: "Miradouro da Senhora do Monte", descricao: "O mirante mais alto da cidade, ótimo no fim da tarde.", custo: "gratuito", custo_estimado: "Grátis", melhor_momento: "Pôr do sol", dica_local: "Suba pela Graça e evite o elétrico 28 lotado." },
        { nome: "LX Factory aos domingos", descricao: "Antigo complexo industrial com feira de rua e livraria.", custo: "baixo custo", custo_estimado: "R$ 20–40 por pessoa", melhor_momento: "Domingo de manhã", dica_local: "Vá cedo para pegar a feira vazia." },
        { nome: "Museu Calouste Gulbenkian (domingo à tarde)", descricao: "Coleção incrível com jardim, entrada gratuita aos domingos após as 14h.", custo: "gratuito", custo_estimado: "Grátis", melhor_momento: "Domingo após 14h", dica_local: "Leve um lanche para o jardim." },
      ] };
    } else if (props.includes("esquecer")) {
      const text = parts.map((p) => p.text ?? "").join("\n");
      log("GEMINI memory prompt:", text.replace(/\n/g, " | "));
      out = { max_escalas: 1, max_duracao_escala_horas: 4, orcamento_hospedagem_max: 2500, interesses: ["gastronomia", "trilhas"], esquecer: [], resposta: "Anotado! Vou priorizar no máximo 1 escala curta e hospedagens até R$ 2.500." };
    } else {
      out = { erro: "schema desconhecido" };
    }
    send(res, 200, {
      candidates: [{ content: { role: "model", parts: [{ text: "pensando…", thought: true }, { text: JSON.stringify(out) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
    });
  })
  .listen(4020, () => log("gemini mock :4020"));

/* ------------------------- Supabase PostgREST :54321 ------------------------- */
const tables = { despesas: [], preferencias_duo: [], memoria_ia: [], viagens: [] };
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-expose-headers": "content-range",
};
http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    const url = new URL(req.url, "http://localhost");
    const match = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
    if (!match || !tables[match[1]]) return send(res, 404, { message: `no route ${url.pathname}` }, cors);
    const table = match[1];
    const rows = tables[table];
    const raw = await readBody(req);
    log("SUPABASE", req.method, table, url.search, raw ? raw.slice(0, 160) : "");
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const filterNull = url.searchParams.get("user_id") === "is.null";
    const pick = (list) => (filterNull ? list.filter((r) => r.user_id === null) : list);

    if (req.method === "GET") {
      let list = pick(rows);
      const order = url.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(",")[0].split(".");
        list = [...list].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
      }
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      return send(res, 200, list.slice(0, limit), cors);
    }
    if (req.method === "POST") {
      const input = [].concat(JSON.parse(raw));
      const conflict = url.searchParams.get("on_conflict")?.split(",");
      const now = new Date().toISOString();
      const saved = input.map((row) => {
        const existing = conflict && rows.find((r) => conflict.every((k) => r[k] === row[k]));
        if (existing) return Object.assign(existing, row);
        const created = { id: randomUUID(), created_at: now, ...row };
        rows.push(created);
        return created;
      });
      return send(res, 201, single ? saved[0] : saved, cors);
    }
    if (req.method === "DELETE") {
      const chave = url.searchParams.get("chave");
      const keys = chave?.startsWith("in.(") ? chave.slice(4, -1).split(",").map((k) => k.replace(/"/g, "")) : [];
      tables[table] = rows.filter((r) => !(keys.includes(r.chave) && (!filterNull || r.user_id === null)));
      return send(res, 204, null, cors);
    }
    send(res, 405, { message: "method" }, cors);
  })
  .listen(54321, () => log("supabase mock :54321"));
