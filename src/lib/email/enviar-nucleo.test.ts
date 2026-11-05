import { describe, expect, it, vi } from "vitest";
import { criarEnviador, mascararEmail, URL_RESEND, type MensagemEmail } from "./enviar-nucleo";

const msg: MensagemEmail = {
  para: "Ana@Exemplo.com",
  assunto: "Teste",
  html: "<p>oi</p>",
  texto: "oi",
  idempotencia: "chave-1",
  categoria: "alerta_preco",
};

function resposta(status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...cabecalhos } });
}

function montar(respostas: (Response | Error)[]) {
  const fetch = vi.fn(async () => {
    const proxima = respostas.shift();
    if (!proxima) throw new Error("sem resposta preparada");
    if (proxima instanceof Error) throw proxima;
    return proxima;
  });
  const esperar = vi.fn(async () => {});
  const registrar = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const enviar = criarEnviador({ apiKey: "re_teste", remetente: "DuoPlanner <oi@duo.app>", fetch, esperar, registrar });
  return { enviar, fetch, esperar, registrar };
}

describe("envio pela Resend", () => {
  it("sem chave não chama a API e registra com o e-mail mascarado", async () => {
    const fetch = vi.fn();
    const registrar = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const enviar = criarEnviador({ apiKey: undefined, remetente: "x <x@x.com>", fetch, registrar });
    expect(await enviar(msg)).toMatchObject({ ok: false, motivo: "nao_configurado" });
    expect(fetch).not.toHaveBeenCalled();
    const log = String(registrar.info.mock.calls[0]?.[0]);
    expect(log).toContain("an***@exemplo.com");
    expect(log).not.toContain("ana@exemplo.com");
  });

  it("recusa destinatário inválido sem chamar a API", async () => {
    const { enviar, fetch } = montar([]);
    expect(await enviar({ ...msg, para: "sem-arroba" })).toMatchObject({ ok: false, motivo: "destinatario_invalido" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("envia com autorização, chave de idempotência e destinatário normalizado", async () => {
    const { enviar, fetch } = montar([resposta(200, { id: "email_1" })]);
    expect(await enviar(msg)).toEqual({ ok: true, id: "email_1", repetido: false });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_RESEND);
    const cabecalhos = init.headers as Record<string, string>;
    expect(cabecalhos.Authorization).toBe("Bearer re_teste");
    expect(cabecalhos["Idempotency-Key"]).toBe("chave-1");
    const corpo = JSON.parse(String(init.body));
    expect(corpo).toMatchObject({ from: "DuoPlanner <oi@duo.app>", to: ["ana@exemplo.com"], subject: "Teste", text: "oi" });
    expect(corpo.tags).toEqual([{ name: "categoria", value: "alerta_preco" }]);
  });

  it("excesso de requisições: espera o Retry-After e tenta de novo", async () => {
    const { enviar, fetch, esperar } = montar([
      resposta(429, { name: "rate_limit_exceeded" }, { "retry-after": "1" }),
      resposta(200, { id: "email_2" }),
    ]);
    expect(await enviar(msg)).toMatchObject({ ok: true, id: "email_2" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledWith(1000);
  });

  it("cota diária estourada não adianta repetir", async () => {
    const { enviar, fetch } = montar([resposta(429, { name: "daily_quota_exceeded" })]);
    expect(await enviar(msg)).toMatchObject({ ok: false, motivo: "limite" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("chave de idempotência já usada conta como já enviado", async () => {
    const { enviar } = montar([resposta(409, { name: "invalid_idempotent_request" })]);
    expect(await enviar(msg)).toEqual({ ok: true, id: null, repetido: true });
  });

  it("erro 5xx ou de rede só é repetido com chave de idempotência", async () => {
    const comChave = montar([resposta(500, { name: "internal_server_error" }), resposta(200, { id: "email_3" })]);
    expect(await comChave.enviar(msg)).toMatchObject({ ok: true, id: "email_3" });

    const semChave = montar([resposta(500, { name: "internal_server_error" })]);
    expect(await semChave.enviar({ ...msg, idempotencia: undefined })).toMatchObject({ ok: false, motivo: "falha" });
    expect(semChave.fetch).toHaveBeenCalledTimes(1);

    const rede = montar([new Error("ECONNRESET"), resposta(200, { id: "email_4" })]);
    expect(await rede.enviar(msg)).toMatchObject({ ok: true, id: "email_4" });
  });

  it("validação recusada pela Resend não é repetida", async () => {
    const { enviar, fetch, registrar } = montar([resposta(422, { name: "validation_error", message: "from inválido" })]);
    expect(await enviar(msg)).toMatchObject({ ok: false, motivo: "rejeitado" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(registrar.error).toHaveBeenCalled();
  });

  it("mascara e-mails nos logs", () => {
    expect(mascararEmail("ana.silva@gmail.com")).toBe("an***@gmail.com");
    expect(mascararEmail("invalido")).toBe("***");
  });
});
