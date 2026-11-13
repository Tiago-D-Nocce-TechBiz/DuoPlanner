import { describe, expect, it, vi } from "vitest";
import { pedirExperiencias } from "./experiencias-cliente";
import { linhaDoEvento, type EstadoExperiencias, type EventoExperiencias, type LocalGem } from "./experiencias-protocolo";

const gem = (n: number): LocalGem => ({
  nome: `Lugar ${n}`,
  descricao: `O que fazer no lugar ${n}.`,
  custo: "gratuito",
  custo_estimado: "Grátis",
  melhor_momento: "Manhã",
  dica_local: "Chegue cedo.",
});

/**
 * Resposta em fluxo controlada pelo teste: cada `enviar` manda bytes (podem
 * partir uma linha ao meio, ou um acento), `fechar` termina, `quebrar` simula
 * a conexão caindo.
 */
function respostaEmFluxo(status = 200) {
  let controle!: ReadableStreamDefaultController<Uint8Array>;
  const corpo = new ReadableStream<Uint8Array>({ start: (c) => void (controle = c) });
  const codificador = new TextEncoder();
  return {
    resposta: new Response(corpo, { status, headers: { "content-type": "application/x-ndjson" } }),
    enviar: (texto: string | Uint8Array) => controle.enqueue(typeof texto === "string" ? codificador.encode(texto) : texto),
    eventos: (...lista: EventoExperiencias[]) => controle.enqueue(codificador.encode(lista.map(linhaDoEvento).join(""))),
    fechar: () => controle.close(),
    quebrar: () => controle.error(new TypeError("network error")),
  };
}

/** Espera o estado passar no critério (o fluxo roda em microtarefas). */
async function ate(pedido: ReturnType<typeof pedirExperiencias>, criterio: (e: EstadoExperiencias) => boolean) {
  await vi.waitFor(() => expect(criterio(pedido.estado())).toBe(true), { timeout: 2000, interval: 2 });
  return pedido.estado();
}

describe("pedirExperiencias (navegador)", () => {
  it("o estado acompanha o fluxo: conectando → rascunho → card pronto → fim, avisando quem assina", async () => {
    const fluxo = respostaEmFluxo();
    const fazerFetch = vi.fn(async () => fluxo.resposta);
    const pedido = pedirExperiencias("Lisboa", "2026-12-05", { fazerFetch });
    const avisos = vi.fn();
    pedido.assinar(avisos);
    expect(pedido.estado().fase).toBe("conectando");

    const [url, init] = fazerFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/experiencias");
    expect(JSON.parse(init.body as string)).toEqual({ destino: "Lisboa", dataViagem: "2026-12-05" });

    fluxo.eventos({ tipo: "inicio", destino: "Lisboa", contexto: [] }, { tipo: "rascunho", indice: 0, experiencia: { nome: "Lug" } });
    expect((await ate(pedido, (e) => e.rascunho !== null)).fase).toBe("escrevendo");

    // Uma linha partida ao meio entre dois trechos.
    const linha = linhaDoEvento({ tipo: "experiencia", indice: 0, experiencia: gem(1) });
    fluxo.enviar(linha.slice(0, 30));
    fluxo.enviar(linha.slice(30));
    const comCard = await ate(pedido, (e) => e.prontas.length === 1);
    expect(comCard.rascunho).toBeNull();

    fluxo.eventos({ tipo: "experiencia", indice: 1, experiencia: gem(2) }, { tipo: "experiencia", indice: 2, experiencia: gem(3) }, { tipo: "fim" });
    fluxo.fechar();
    const final = await ate(pedido, (e) => e.fase === "pronto");
    expect(final.prontas.map((p) => p.experiencia.nome)).toEqual(["Lugar 1", "Lugar 2", "Lugar 3"]);
    // Duas linhas no mesmo trecho = um aviso só (um render).
    expect(avisos.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("acento partido entre trechos chega inteiro", async () => {
    const fluxo = respostaEmFluxo();
    const pedido = pedirExperiencias("São Paulo", null, { fazerFetch: async () => fluxo.resposta });
    const bytes = new TextEncoder().encode(linhaDoEvento({ tipo: "inicio", destino: "São Paulo", contexto: [] }));
    const corte = bytes.indexOf(0xc3) + 1; // no meio do "ã"
    fluxo.enviar(bytes.slice(0, corte));
    fluxo.enviar(bytes.slice(corte));
    expect((await ate(pedido, (e) => e.fase === "escrevendo")).destino).toBe("São Paulo");
  });

  it("erro antes do fluxo (HTTP 429/401/503): a mensagem do servidor, em PT-BR", async () => {
    const pedido = pedirExperiencias("Lisboa", null, {
      fazerFetch: async () => Response.json({ error: "Você atingiu o limite de uso da IA.", code: "COTA_EXCEDIDA" }, { status: 429 }),
    });
    expect(await ate(pedido, (e) => e.fase === "erro")).toMatchObject({ erro: "Você atingiu o limite de uso da IA." });
  });

  it("resposta de erro sem JSON (ex.: HTML de 502): mensagem genérica", async () => {
    const pedido = pedirExperiencias("Lisboa", null, {
      fazerFetch: async () => new Response("<html>Bad Gateway</html>", { status: 502 }),
    });
    expect((await ate(pedido, (e) => e.fase === "erro")).erro).toBe("Sugestões indisponíveis agora.");
  });

  it("conexão caiu no meio: guarda o que chegou e avisa", async () => {
    const fluxo = respostaEmFluxo();
    const pedido = pedirExperiencias("Lisboa", null, { fazerFetch: async () => fluxo.resposta });
    fluxo.eventos({ tipo: "inicio", destino: "Lisboa", contexto: [] }, { tipo: "experiencia", indice: 0, experiencia: gem(1) });
    await ate(pedido, (e) => e.prontas.length === 1);
    fluxo.quebrar();
    const e = await ate(pedido, (x) => x.fase === "erro");
    expect(e.prontas).toHaveLength(1);
    expect(e.erro).toBe("Sem conexão com o servidor agora.");
  });

  it("fechou sem `fim`: avisa que a conexão caiu", async () => {
    const fluxo = respostaEmFluxo();
    const pedido = pedirExperiencias("Lisboa", null, { fazerFetch: async () => fluxo.resposta });
    fluxo.eventos({ tipo: "inicio", destino: "Lisboa", contexto: [] });
    fluxo.fechar();
    expect((await ate(pedido, (e) => e.fase === "erro")).erro).toBe("A conexão caiu antes do fim das sugestões.");
  });

  it("rede parada: desiste no prazo sem dados, com mensagem própria", async () => {
    const fluxo = respostaEmFluxo();
    let sinal: AbortSignal | undefined;
    const pedido = pedirExperiencias("Lisboa", null, {
      prazoSemDadosMs: 40,
      fazerFetch: async (_url, init) => {
        sinal = init?.signal ?? undefined;
        // Corpo que só termina quando o sinal aborta (como o fetch real).
        sinal?.addEventListener("abort", () => fluxo.quebrar());
        return fluxo.resposta;
      },
    });
    fluxo.eventos({ tipo: "inicio", destino: "Lisboa", contexto: [] });
    const e = await ate(pedido, (x) => x.fase === "erro");
    expect(e.erro).toContain("lenta demais");
    expect(sinal?.aborted).toBe(true);
  });

  it("cancelado (nova busca ou saiu da tela): aborta a conexão e não vira erro", async () => {
    const fluxo = respostaEmFluxo();
    let sinal: AbortSignal | undefined;
    const pedido = pedirExperiencias("Lisboa", null, {
      fazerFetch: async (_url, init) => {
        sinal = init?.signal ?? undefined;
        sinal?.addEventListener("abort", () => fluxo.quebrar());
        return fluxo.resposta;
      },
    });
    fluxo.eventos({ tipo: "inicio", destino: "Lisboa", contexto: [] });
    await ate(pedido, (e) => e.fase === "escrevendo");
    pedido.cancelar();
    await new Promise((r) => setTimeout(r, 20));
    expect(sinal?.aborted).toBe(true);
    expect(pedido.estado().fase).toBe("escrevendo");
  });
});
