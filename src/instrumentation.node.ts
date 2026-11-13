import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ProcessadorDeLentidao } from "@/lib/observabilidade/lentidao";

/**
 * OpenTelemetry no runtime Node (carregado só por `instrumentation.ts`).
 *
 * Com um TracerProvider registrado, o Next passa a emitir os próprios spans
 * (requisição, rota de API) e o `withAuthAction` emite um por Server Action.
 * O único destino é o `ProcessadorDeLentidao`: nada é exportado para fora,
 * só uma linha de aviso no log quando algo passa de 1,5 s. O `register()`
 * também instala o contexto assíncrono (AsyncLocalStorage), que liga o span
 * da action ao da requisição.
 */
const provedor = new NodeTracerProvider({ spanProcessors: [new ProcessadorDeLentidao()] });
provedor.register();
