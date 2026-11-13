import { z } from "zod";
import { daMesmaOrigem } from "@/lib/http/mesma-origem";
import { METRICAS } from "./metricas";

/**
 * Web Vitals de quem usa o app (LCP, INP, CLS, mais FCP e TTFB), enviados
 * pelo navegador a `/api/vitals` e registrados no log do servidor como uma
 * linha JSON por métrica. Sem serviço de terceiros. Só no servidor (zod).
 *
 * A rota é pública (a landing e o login também são medidos), então tudo aqui
 * é defensivo: só a mesma origem, corpo pequeno, campos fechados e caminho
 * sem query (nada de código de convite ou e-mail no log).
 */

/** Corpo máximo aceito (5 métricas de uma página cabem com folga). */
export const TAMANHO_MAXIMO_RELATORIO = 4096;

const esquemaRelatorio = z.object({
  metricas: z
    .array(
      z.object({
        nome: z.enum(METRICAS),
        valor: z.number().finite().min(0).max(600_000),
        nota: z.enum(["good", "needs-improvement", "poor"]),
        id: z.string().min(1).max(80),
        navegacao: z.string().max(40).optional(),
        pagina: z.string().max(200).regex(/^\/[\w\-./]*$/, "caminho inválido"),
      })
    )
    .min(1)
    .max(10),
});

export type RelatorioVitals = z.infer<typeof esquemaRelatorio>;

export type LeituraRelatorio = { ok: true; relatorio: RelatorioVitals } | { ok: false; status: 400 | 403 | 413 };

/** Valida um envio: só da mesma origem (`daMesmaOrigem`), pequeno e no formato. */
export function lerRelatorio(texto: string, cabecalhos: Headers): LeituraRelatorio {
  if (!daMesmaOrigem(cabecalhos)) return { ok: false, status: 403 };
  if (texto.length > TAMANHO_MAXIMO_RELATORIO) return { ok: false, status: 413 };
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, status: 400 };
  }
  const lido = esquemaRelatorio.safeParse(bruto);
  return lido.success ? { ok: true, relatorio: lido.data } : { ok: false, status: 400 };
}

/** Uma linha de log por métrica; nota "poor" vira aviso. */
export function registrarRelatorio(
  relatorio: RelatorioVitals,
  log: Pick<Console, "info" | "warn"> = console
): void {
  for (const m of relatorio.metricas) {
    const linha = JSON.stringify({
      evento: "web_vital",
      metrica: m.nome,
      valor: m.nome === "CLS" ? Math.round(m.valor * 1000) / 1000 : Math.round(m.valor),
      nota: m.nota,
      pagina: m.pagina,
      navegacao: m.navegacao,
      id: m.id,
    });
    if (m.nota === "poor") log.warn(linha);
    else log.info(linha);
  }
}
