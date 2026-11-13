import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-node";

/**
 * Observabilidade de lentidão no servidor (OpenTelemetry), sem coletor
 * externo: um SpanProcessor que olha cada span que termina e, passando de
 * `LIMITE_LENTO_MS`, escreve UMA linha JSON de aviso no log (a Vercel indexa
 * JSON). Registrado pelo `instrumentation.node.ts`.
 *
 * Só três tipos de span interessam (o resto é ruído interno do Next):
 *  - a requisição inteira (`BaseServer.handleRequest`, span raiz do Next);
 *  - o handler de uma rota de API (`AppRouteRouteHandlers.runHandler`);
 *  - uma Server Action (`withAuthAction` abre o span com `duoplanner.acao`).
 * Uma action ou rota lenta deixa lenta também a requisição que a carrega: a
 * requisição não é relatada de novo (mesmo traceId), o filho já disse qual
 * foi.
 */

export const LIMITE_LENTO_MS = 1500;

/** Atributo que o envoltório das Server Actions põe no span. */
export const ATRIBUTO_ACAO = "duoplanner.acao";

const TIPO_REQUISICAO = "BaseServer.handleRequest";
const TIPO_ROTA_API = "AppRouteRouteHandlers.runHandler";

export interface AvisoLentidao {
  nivel: "warn";
  evento: "chamada_lenta";
  tipo: "acao" | "rota_api" | "requisicao";
  nome: string;
  duracaoMs: number;
  limiteMs: number;
  rota?: string;
  metodo?: string;
  status?: number;
  acao?: string;
  traceId: string;
}

const ms = ([segundos, nanos]: readonly [number, number]) => segundos * 1000 + nanos / 1e6;

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor ? valor : undefined;
}

export class ProcessadorDeLentidao implements SpanProcessor {
  /** traceIds já relatados por uma action (a requisição que os contém não repete). */
  private readonly relatados = new Set<string>();

  constructor(
    private readonly limiteMs = LIMITE_LENTO_MS,
    private readonly registrar: (aviso: AvisoLentidao) => void = (aviso) => console.warn(JSON.stringify(aviso))
  ) {}

  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    const duracaoMs = Math.round(ms(span.duration));
    if (duracaoMs < this.limiteMs) return;

    const a = span.attributes;
    const acao = texto(a[ATRIBUTO_ACAO]);
    const tipoNext = texto(a["next.span_type"]);
    const tipo = acao ? "acao" : tipoNext === TIPO_ROTA_API ? "rota_api" : tipoNext === TIPO_REQUISICAO ? "requisicao" : null;
    if (!tipo) return;

    const traceId = span.spanContext().traceId;
    // A requisição termina depois dos filhos: se a action ou a rota já foi
    // relatada, a requisição dela não repete o aviso.
    if (tipo === "requisicao" && this.relatados.delete(traceId)) return;
    if (tipo !== "requisicao") this.lembrar(traceId);

    const status = a["http.status_code"] ?? a["http.response.status_code"];
    this.registrar({
      nivel: "warn",
      evento: "chamada_lenta",
      tipo,
      nome: span.name,
      duracaoMs,
      limiteMs: this.limiteMs,
      rota: texto(a["next.route"]) ?? texto(a["http.route"]),
      metodo: texto(a["http.method"]) ?? texto(a["http.request.method"]),
      status: typeof status === "number" ? status : undefined,
      acao,
      traceId,
    });
  }

  private lembrar(traceId: string) {
    this.relatados.add(traceId);
    // Limite de memória: a requisição costuma terminar logo depois da action.
    if (this.relatados.size > 500) {
      const maisAntigo = this.relatados.values().next().value;
      if (maisAntigo !== undefined) this.relatados.delete(maisAntigo);
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    this.relatados.clear();
    return Promise.resolve();
  }
}
