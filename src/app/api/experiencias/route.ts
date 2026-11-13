import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { linhaDoEvento, PADRAO_DESTINO, type EventoExperiencias } from "@/lib/ai/experiencias-protocolo";
import { contextoDasPreferencias, eventosDasExperiencias, experienciasEmCache } from "@/lib/ai/local-gems-agent";
import { AiNotConfiguredError } from "@/lib/ai/model";
import { exigirSessaoApi } from "@/lib/auth/sessao";
import { monthLabel } from "@/lib/dates";
import { integracaoAtiva } from "@/lib/env";
import { lerCorpoLimitado } from "@/lib/http/corpo-limitado";
import { daMesmaOrigem } from "@/lib/http/mesma-origem";
import { loadPreferencesSafe } from "@/lib/memory/store";
import { consumirCota, respostaCotaNegada } from "@/lib/seguranca/cotas";
import { isoDateSchema } from "@/lib/travel/params";

/**
 * POST /api/experiencias — "Experiências Ocultas" em fluxo (NDJSON, uma
 * linha por evento; protocolo em `experiencias-protocolo.ts`). As telas de
 * busca chamam assim que o destino é conhecido.
 *
 * Corpo: `{ "destino": "Lisboa", "dataViagem": "2026-12-01" | null }`.
 *
 * Ordem: mesma origem (403) → sessão (401) → corpo e validação (413/415/400)
 * → IA configurada (503) → cache → cota "ia" (429/503) → fluxo. Erros antes
 * do fluxo saem em JSON com o status HTTP; depois que o fluxo começa (200),
 * uma falha chega como o evento `erro`, em PT-BR.
 *
 * Resposta do cache não chama a IA e não gasta a cota. Se a tela fechar a
 * conexão no meio, a chamada ao Gemini é abortada (sem pagar pelo resto).
 */

/** Teto da função: o fluxo tem prazo total próprio (`PRAZO_TOTAL_MS`), com folga. */
export const maxDuration = 60;

const TAMANHO_MAXIMO_PEDIDO = 2048;
const DESTINO_INVALIDO = "Destino inválido para sugestões.";

const esquemaPedido = z.object({
  destino: z.string({ error: DESTINO_INVALIDO }).trim().regex(PADRAO_DESTINO, DESTINO_INVALIDO),
  /** AAAA-MM-DD; inválida é ignorada (as sugestões saem sem o mês). */
  dataViagem: z.string().max(10).nullish(),
});

function recusa(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
}

async function lerPedido(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false as const, resposta: recusa(415, "ENTRADA_INVALIDA", "Envie o pedido em JSON.") };
  }
  const texto = await lerCorpoLimitado(request, TAMANHO_MAXIMO_PEDIDO);
  if (texto === null) return { ok: false as const, resposta: recusa(413, "ENTRADA_INVALIDA", "Pedido grande demais.") };
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false as const, resposta: recusa(400, "ENTRADA_INVALIDA", DESTINO_INVALIDO) };
  }
  const lido = esquemaPedido.safeParse(bruto);
  if (!lido.success) {
    return { ok: false as const, resposta: recusa(400, "ENTRADA_INVALIDA", lido.error.issues[0]?.message ?? DESTINO_INVALIDO) };
  }
  return { ok: true as const, dados: lido.data };
}

/**
 * Os eventos viram o corpo da resposta, um por `pull` (sem acumular na
 * memória). Cancelado pelo cliente: `cancelar` aborta a chamada à IA.
 */
function respostaNdjson(eventos: AsyncGenerator<EventoExperiencias>, cancelar: () => void): Response {
  const codificador = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    async pull(controle) {
      const { value, done } = await eventos.next();
      if (done) controle.close();
      else controle.enqueue(codificador.encode(linhaDoEvento(value)));
    },
    cancel() {
      cancelar();
      void eventos.return(undefined).catch(() => {});
    },
  });
  return new Response(corpo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Proxies como o Nginx seguram a resposta inteira sem isto.
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!daMesmaOrigem(request.headers)) return recusa(403, "ORIGEM_INVALIDA", "Requisição recusada.");

  const auth = await exigirSessaoApi();
  if (!auth.ok) return auth.resposta;
  const { supabase, userId } = auth.sessao;

  const pedidoLido = await lerPedido(request);
  if (!pedidoLido.ok) return pedidoLido.resposta;

  if (!integracaoAtiva("ia")) return recusa(503, "NAO_CONFIGURADO", new AiNotConfiguredError().message);

  const { destino, dataViagem } = pedidoLido.dados;
  const mes = dataViagem && isoDateSchema.safeParse(dataViagem).success ? monthLabel(dataViagem) : null;
  const contexto = contextoDasPreferencias(await loadPreferencesSafe({ supabase, userId }));
  const pedido = { destino, mes, contexto };

  const emCache = experienciasEmCache(pedido);
  if (!emCache) {
    const cota = await consumirCota(supabase, userId, "ia");
    if (!cota.permitido) return respostaCotaNegada(cota);
  }

  const cancelamento = new AbortController();
  const cancelar = () => {
    if (!cancelamento.signal.aborted) cancelamento.abort(new DOMException("A tela fechou a conexão.", "AbortError"));
  };
  request.signal.addEventListener("abort", cancelar, { once: true });

  const eventos = eventosDasExperiencias(pedido, { sinal: cancelamento.signal, emCache });
  return respostaNdjson(eventos, cancelar);
}
