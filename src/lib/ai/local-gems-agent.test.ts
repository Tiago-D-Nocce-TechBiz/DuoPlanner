import { AIMessageChunk } from "@langchain/core/messages";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventoExperiencias, LocalGem } from "./experiencias-protocolo";
import {
  eventosDasExperiencias,
  experienciasEmCache,
  gerarExperienciasEmFluxo,
  limparCacheDeExperiencias,
  PrazoDaIaEsgotado,
  type ModeloEmFluxo,
  type PedidoExperiencias,
} from "./local-gems-agent";

vi.mock("server-only", () => ({}));

const gem = (n: number): LocalGem => ({
  nome: `Lugar ${n}`,
  descricao: `O que fazer no lugar ${n}.`,
  custo: "gratuito",
  custo_estimado: "Grátis",
  melhor_momento: "Fim de tarde",
  dica_local: "Chegue cedo.",
});

const PEDIDO: PedidoExperiencias = { destino: "Lisboa", mes: "dezembro", contexto: [] };
const RESPOSTA = JSON.stringify({ experiencias: [gem(1), gem(2), gem(3)] });
const trechos = (texto: string, tamanho: number) =>
  Array.from({ length: Math.ceil(texto.length / tamanho) }, (_, i) => texto.slice(i * tamanho, (i + 1) * tamanho));

/** Espera `ms` ou rejeita quando o sinal aborta (como o `fetch` do Gemini). */
function esperar(ms: number, sinal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (sinal?.aborted) return reject(sinal.reason);
    const t = setTimeout(resolve, ms);
    sinal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(sinal.reason);
    });
  });
}

type Trecho = string | AIMessageChunk | { travar: true };

/**
 * Modelo falso com o mesmo contrato do Gemini via LangChain (`stream` →
 * fluxo de `AIMessageChunk`), com controle de ritmo e de travamento.
 */
function modeloFalso(lista: Trecho[], { atrasoMs = 0, depoisDoFim }: { atrasoMs?: number; depoisDoFim?: () => Trecho } = {}) {
  const registro = { chamadas: 0, entregues: 0, sinal: undefined as AbortSignal | undefined };
  const modelo: ModeloEmFluxo = {
    async stream(_mensagens, config) {
      registro.chamadas++;
      const sinal = config?.signal;
      registro.sinal = sinal;
      async function* gerar() {
        for (let i = 0; ; i++) {
          const t = i < lista.length ? lista[i] : depoisDoFim?.();
          if (t === undefined) return;
          if (typeof t === "object" && "travar" in t) {
            await new Promise((_, rejeitar) => sinal?.addEventListener("abort", () => rejeitar(sinal.reason)));
          }
          if (atrasoMs) await esperar(atrasoMs, sinal);
          registro.entregues++;
          yield typeof t === "string" ? new AIMessageChunk({ content: t }) : (t as AIMessageChunk);
        }
      }
      return IterableReadableStream.fromAsyncGenerator(gerar());
    },
  };
  return { modelo, registro };
}

async function coletar<T>(fluxo: AsyncIterable<T>): Promise<T[]> {
  const saida: T[] = [];
  for await (const item of fluxo) saida.push(item);
  return saida;
}

beforeEach(() => limparCacheDeExperiencias());
afterEach(() => vi.restoreAllMocks());

describe("gerarExperienciasEmFluxo", () => {
  it("rascunhos e sugestões validadas saem enquanto o modelo ainda escreve", async () => {
    const pedacos = trechos(RESPOSTA, 25);
    const { modelo, registro } = modeloFalso(pedacos);
    const vistos: { tipo: string; entreguesAte: number }[] = [];
    for await (const evento of gerarExperienciasEmFluxo(PEDIDO, { modelo })) {
      vistos.push({ tipo: evento.tipo, entreguesAte: registro.entregues });
    }
    const prontas = vistos.filter((v) => v.tipo === "experiencia");
    expect(prontas).toHaveLength(3);
    // A 1ª ficou pronta bem antes do último trecho do modelo.
    expect(prontas[0].entreguesAte).toBeLessThan(pedacos.length / 2);
    expect(vistos.filter((v) => v.tipo === "rascunho").length).toBeGreaterThan(3);
  });

  it("trechos de raciocínio do Gemini (thought) não entram no JSON", async () => {
    const pensamento = new AIMessageChunk({
      content: [{ type: "text", text: '{"experiencias": "isto é raciocínio"', thought: true }],
      response_metadata: { model_provider: "google" },
    });
    const { modelo } = modeloFalso([pensamento, ...trechos(RESPOSTA, 40)]);
    const eventos = await coletar(gerarExperienciasEmFluxo(PEDIDO, { modelo }));
    expect(eventos.filter((e) => e.tipo === "experiencia").map((e) => e.experiencia.nome)).toEqual([
      "Lugar 1",
      "Lugar 2",
      "Lugar 3",
    ]);
  });

  it("modelo travado: estoura o prazo por trecho e aborta a chamada", async () => {
    const { modelo, registro } = modeloFalso([...trechos(RESPOSTA, 30).slice(0, 4), { travar: true }]);
    const inicio = Date.now();
    await expect(coletar(gerarExperienciasEmFluxo(PEDIDO, { modelo, prazoPorTrechoMs: 60 }))).rejects.toMatchObject({
      name: "TimeoutError",
      motivo: "trecho",
    });
    expect(Date.now() - inicio).toBeLessThan(1000);
    expect(registro.sinal?.aborted).toBe(true);
  });

  it("modelo que não para de pingar trechos: estoura o prazo total", async () => {
    const { modelo, registro } = modeloFalso(["{"], { atrasoMs: 10, depoisDoFim: () => " " });
    await expect(
      coletar(gerarExperienciasEmFluxo(PEDIDO, { modelo, prazoPorTrechoMs: 200, prazoTotalMs: 150 }))
    ).rejects.toBeInstanceOf(PrazoDaIaEsgotado);
    expect(registro.sinal?.aborted).toBe(true);
  });

  it("cancelamento do chamador aborta a chamada ao modelo", async () => {
    const { modelo, registro } = modeloFalso(trechos(RESPOSTA, 10), { atrasoMs: 5 });
    const cancelamento = new AbortController();
    const eventos: EventoExperiencias[] = [];
    await expect(
      (async () => {
        for await (const e of gerarExperienciasEmFluxo(PEDIDO, { modelo, sinal: cancelamento.signal })) {
          eventos.push(e);
          if (e.tipo === "experiencia") cancelamento.abort(new DOMException("saiu", "AbortError"));
        }
      })()
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(eventos.filter((e) => e.tipo === "experiencia")).toHaveLength(1);
    expect(registro.sinal?.aborted).toBe(true);
  });
});

describe("eventosDasExperiencias (o fluxo da rota)", () => {
  it("inicio → sugestões → fim, e a resposta inteira vai para o cache", async () => {
    const { modelo } = modeloFalso(trechos(RESPOSTA, 50));
    const eventos = await coletar(eventosDasExperiencias(PEDIDO, { modelo }));
    expect(eventos[0]).toEqual({ tipo: "inicio", destino: "Lisboa", contexto: [] });
    expect(eventos.at(-1)).toEqual({ tipo: "fim" });
    expect(experienciasEmCache({ ...PEDIDO, destino: " lisboa ".trim() })).toEqual([gem(1), gem(2), gem(3)]);
    // Validade de 1 dia.
    expect(experienciasEmCache(PEDIDO, Date.now() + 25 * 60 * 60 * 1000)).toBeNull();
  });

  it("do cache: as 3 sugestões de uma vez, sem chamar a IA", async () => {
    const { modelo, registro } = modeloFalso([]);
    const eventos = await coletar(eventosDasExperiencias(PEDIDO, { modelo, emCache: [gem(1), gem(2), gem(3)] }));
    expect(eventos.map((e) => e.tipo)).toEqual(["inicio", "experiencia", "experiencia", "experiencia", "fim"]);
    expect(registro.chamadas).toBe(0);
  });

  it("só 2 válidas: mostra as duas, termina normalmente e não guarda no cache", async () => {
    const torta = JSON.stringify({ experiencias: [gem(1), { nome: "pela metade" }, gem(3)] });
    const { modelo } = modeloFalso(trechos(torta, 40));
    const eventos = await coletar(eventosDasExperiencias(PEDIDO, { modelo }));
    expect(eventos.filter((e) => e.tipo === "experiencia")).toHaveLength(2);
    expect(eventos.at(-1)).toEqual({ tipo: "fim" });
    expect(experienciasEmCache(PEDIDO)).toBeNull();
  });

  it("nenhuma válida: erro em PT-BR", async () => {
    const { modelo } = modeloFalso(["Desculpe, não posso ajudar."]);
    const eventos = await coletar(eventosDasExperiencias(PEDIDO, { modelo }));
    expect(eventos.at(-1)).toMatchObject({ tipo: "erro", mensagem: expect.stringContaining("sugestões válidas") });
  });

  it("falha no meio: as que chegaram ficam e o erro avisa, sem detalhe interno", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { modelo } = modeloFalso([...trechos(RESPOSTA, 30).slice(0, 12), { travar: true }]);
    const eventos = await coletar(eventosDasExperiencias(PEDIDO, { modelo, prazoPorTrechoMs: 50 }));
    expect(eventos.filter((e) => e.tipo === "experiencia").length).toBeGreaterThan(0);
    const fim = eventos.at(-1);
    expect(fim).toMatchObject({ tipo: "erro" });
    expect(fim?.tipo === "erro" && fim.mensagem).toContain("As sugestões acima chegaram antes da falha.");
    expect(experienciasEmCache(PEDIDO)).toBeNull();
    expect(JSON.parse(aviso.mock.calls[0][0] as string)).toMatchObject({ evento: "ia_prazo_esgotado", motivo: "trecho" });
  });

  it("erro do provedor vira mensagem genérica (o detalhe só no log)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const modelo: ModeloEmFluxo = {
      stream: async () => {
        throw new Error("503 UNAVAILABLE chave=AIza-segredo");
      },
    };
    const eventos = await coletar(eventosDasExperiencias(PEDIDO, { modelo }));
    expect(eventos.at(-1)).toEqual({ tipo: "erro", mensagem: "A IA não conseguiu terminar as sugestões agora." });
    expect(log).toHaveBeenCalled();
  });

  it("cancelado pelo chamador: termina em silêncio (sem evento de erro)", async () => {
    const { modelo } = modeloFalso([{ travar: true }]);
    const cancelamento = new AbortController();
    setTimeout(() => cancelamento.abort(new DOMException("saiu", "AbortError")), 20);
    const eventos = await coletar(eventosDasExperiencias(PEDIDO, { modelo, sinal: cancelamento.signal }));
    expect(eventos.map((e) => e.tipo)).toEqual(["inicio"]);
  });
});
