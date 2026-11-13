import { describe, expect, it } from "vitest";
import { daMesmaOrigem } from "./mesma-origem";

const HOST = "duo.example.com";

describe("daMesmaOrigem (CSRF nas rotas POST)", () => {
  it("aceita a página do próprio app", () => {
    expect(daMesmaOrigem(new Headers({ "sec-fetch-site": "same-origin", origin: `https://${HOST}`, host: HOST }))).toBe(true);
    // Navegador sem Origin (alguns GET/HEAD), mas com Sec-Fetch-Site.
    expect(daMesmaOrigem(new Headers({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("atrás do proxy, compara com o x-forwarded-host (o host é o interno)", () => {
    const h = new Headers({ origin: `https://${HOST}`, host: "interno:3000", "x-forwarded-host": `${HOST}, proxy.local` });
    expect(daMesmaOrigem(h)).toBe(true);
  });

  it("recusa outro site, origem malformada e requisição sem nenhum dos dois cabeçalhos", () => {
    expect(daMesmaOrigem(new Headers({ "sec-fetch-site": "cross-site", origin: `https://${HOST}`, host: HOST }))).toBe(false);
    expect(daMesmaOrigem(new Headers({ "sec-fetch-site": "same-site", origin: `https://app.${HOST}`, host: HOST }))).toBe(false);
    expect(daMesmaOrigem(new Headers({ origin: "https://outro.site", host: HOST }))).toBe(false);
    expect(daMesmaOrigem(new Headers({ origin: "null", host: HOST }))).toBe(false);
    expect(daMesmaOrigem(new Headers({ host: HOST }))).toBe(false);
  });
});
