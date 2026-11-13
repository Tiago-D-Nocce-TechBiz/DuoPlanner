import { NextResponse, type NextRequest } from "next/server";
import { lerCorpoLimitado } from "@/lib/http/corpo-limitado";
import { daMesmaOrigem } from "@/lib/http/mesma-origem";
import { lerRelatorio, registrarRelatorio, TAMANHO_MAXIMO_RELATORIO } from "@/lib/observabilidade/web-vitals";

/**
 * POST /api/vitals: Web Vitals do navegador (LCP, INP, CLS, FCP, TTFB) para o
 * log do servidor, uma linha JSON por métrica (ver `MonitorWebVitals`).
 *
 * Pública de propósito (mede também a landing e o login), mas só aceita a
 * mesma origem, corpo de até 4 KB (conferido durante a leitura) e campos
 * fechados. Responde 204 sem corpo.
 */
export async function POST(request: NextRequest) {
  if (!daMesmaOrigem(request.headers)) return new NextResponse(null, { status: 403 });
  const texto = await lerCorpoLimitado(request, TAMANHO_MAXIMO_RELATORIO);
  if (texto === null) return new NextResponse(null, { status: 413 });
  const lido = lerRelatorio(texto, request.headers);
  if (!lido.ok) return new NextResponse(null, { status: lido.status });
  registrarRelatorio(lido.relatorio);
  return new NextResponse(null, { status: 204 });
}
