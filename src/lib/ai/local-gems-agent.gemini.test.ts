import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventoExperiencias, LocalGem } from "./experiencias-protocolo";
import { gerarExperienciasEmFluxo, PrazoDaIaEsgotado, type PedidoExperiencias } from "./local-gems-agent";

/**
 * Contrato com a API do Gemini, sem rede: um servidor local fala o mesmo
 * SSE do `streamGenerateContent` e o agente usa o `ChatGoogle` de verdade
 * (via `GEMINI_API_BASE_URL`). Pega mudança de formato numa atualização da
 * LangChain: pedido em modo JSON, trechos de raciocínio fora do texto e
 * conexão fechada quando o prazo estoura.
 */

vi.mock("server-only", () => ({}));

const gem = (n: number): LocalGem => ({
  nome: `Mirante ${n}`,
  descricao: `Vista da cidade número ${n}.`,
  custo: "gratuito",
  custo_estimado: "Grátis",
  melhor_momento: "Pôr do sol",
  dica_local: "Leve casaco.",
});
const RESPOSTA = JSON.stringify({ experiencias: [gem(1), gem(2), gem(3)] });
const PEDIDO: PedidoExperiencias = { destino: "Lisboa", mes: "dezembro", contexto: ["Passeios só gratuitos"] };

type Roteiro = { pedacos: string[]; atrasoMs: number; travarApos?: number };

let servidor: Server;
let porta = 0;
let roteiro: Roteiro = { pedacos: [], atrasoMs: 0 };
const recebidos: { url: string; corpo: Record<string, unknown> }[] = [];
let conexoesFechadasAntesDoFim = 0;

const sse = (res: ServerResponse, dados: unknown) => res.write(`data: ${JSON.stringify(dados)}\r\n\r\n`);
const parte = (text: string, extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { role: "model", parts: [{ text, ...extra }] }, index: 0 }],
});

async function atender(req: IncomingMessage, res: ServerResponse) {
  let texto = "";
  for await (const pedaco of req) texto += pedaco;
  recebidos.push({ url: req.url ?? "", corpo: JSON.parse(texto) });

  let terminou = false;
  res.on("close", () => {
    if (!terminou) conexoesFechadasAntesDoFim++;
  });
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  // Raciocínio primeiro (o modelo "pensa" com includeThoughts), depois o JSON.
  sse(res, parte("Pensando em lugares gratuitos em Lisboa...", { thought: true }));
  for (const [i, pedaco] of roteiro.pedacos.entries()) {
    if (roteiro.travarApos !== undefined && i >= roteiro.travarApos) return; // fica aberto, sem mandar nada
    await new Promise((r) => setTimeout(r, roteiro.atrasoMs));
    if (res.destroyed) return;
    sse(res, parte(pedaco));
  }
  sse(res, { ...parte(""), candidates: [{ content: { role: "model", parts: [{ text: "" }] }, finishReason: "STOP", index: 0 }] });
  terminou = true;
  res.end();
}

beforeAll(async () => {
  servidor = createServer((req, res) => void atender(req, res));
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  porta = (servidor.address() as AddressInfo).port;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  servidor.closeAllConnections();
  await new Promise((r) => servidor.close(r));
});
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "chave-de-teste");
  vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
  vi.stubEnv("GEMINI_API_BASE_URL", `http://localhost:${porta}`);
  recebidos.length = 0;
  conexoesFechadasAntesDoFim = 0;
});

const pedacosDe = (texto: string, n: number) =>
  Array.from({ length: Math.ceil(texto.length / n) }, (_, i) => texto.slice(i * n, (i + 1) * n));

describe("agente de experiências × API do Gemini (SSE local)", () => {
  it("pede em modo JSON com o esquema e entrega as sugestões em fluxo, sem o raciocínio", async () => {
    roteiro = { pedacos: pedacosDe(RESPOSTA, 60), atrasoMs: 5 };
    const eventos: EventoExperiencias[] = [];
    for await (const e of gerarExperienciasEmFluxo(PEDIDO)) eventos.push(e);

    const [pedido] = recebidos;
    expect(pedido.url).toContain(":streamGenerateContent");
    expect(pedido.url).toContain("alt=sse");
    const geracao = pedido.corpo.generationConfig as Record<string, unknown>;
    expect(geracao.responseMimeType).toBe("application/json");
    const esquema = geracao.responseJsonSchema as { properties: { experiencias: { items: { properties: object } } } };
    // A ordem das chaves é a ordem em que o modelo escreve: o nome primeiro.
    expect(Object.keys(esquema.properties.experiencias.items.properties)[0]).toBe("nome");
    expect(JSON.stringify(pedido.corpo.contents)).toContain("Passeios só gratuitos");

    expect(eventos.filter((e) => e.tipo === "experiencia").map((e) => e.experiencia)).toEqual([gem(1), gem(2), gem(3)]);
    const primeiroRascunho = eventos.find((e) => e.tipo === "rascunho");
    expect(primeiroRascunho).toMatchObject({ indice: 0, experiencia: { nome: expect.stringMatching(/^Mirante/) } });
  });

  it("Gemini travado no meio: o prazo por trecho estoura e a conexão HTTP é fechada", async () => {
    roteiro = { pedacos: pedacosDe(RESPOSTA, 60), atrasoMs: 5, travarApos: 4 };
    const eventos: EventoExperiencias[] = [];
    const inicio = Date.now();
    await expect(
      (async () => {
        for await (const e of gerarExperienciasEmFluxo(PEDIDO, { prazoPorTrechoMs: 300 })) eventos.push(e);
      })()
    ).rejects.toBeInstanceOf(PrazoDaIaEsgotado);
    expect(Date.now() - inicio).toBeLessThan(3000);
    expect(eventos.some((e) => e.tipo === "rascunho")).toBe(true);
    await vi.waitFor(() => expect(conexoesFechadasAntesDoFim).toBe(1));
  });
});
