import "server-only";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { fetchWithTimeout } from "@/lib/http/fetch-com-limite";

/**
 * Cotações do dia em reais (AwesomeAPI, gratuita, sem chave).
 *
 * Cache de 1 hora (`cacheLife("hours")`): no máximo uma chamada por hora ao
 * serviço, qualquer que seja o tráfego, bem abaixo do limite gratuito. Em
 * falha, guarda o erro por pouco tempo e a tela volta às taxas de referência.
 *
 * Prazo de 5 s, abaixo dos 8 s padrão: a cotação é acessória (há taxas de
 * referência) e a rota é revalidada em segundo plano.
 */
const PRAZO_COTACOES_MS = 5_000;

export const MOEDAS_COTADAS = ["USD", "EUR", "GBP", "ARS", "CLP"] as const;
export type MoedaCotada = (typeof MOEDAS_COTADAS)[number];

export type ResultadoCotacoes =
  | {
      ok: true;
      /** 1 unidade da moeda em reais (preço de compra). */
      taxas: Partial<Record<MoedaCotada, number>>;
      /** Cotação mais antiga e mais recente ("2026-10-30 19:00:08", horário
       *  de Brasília): cada par é atualizado em um momento diferente. */
      atualizadoDe: string;
      atualizadoAte: string;
      fonte: "AwesomeAPI";
    }
  | { ok: false; mensagem: string };

const URL_COTACOES = `https://economia.awesomeapi.com.br/json/last/${MOEDAS_COTADAS.map((m) => `${m}-BRL`).join(",")}`;

const esquemaResposta = z.record(
  z.string(),
  z.object({ bid: z.string(), create_date: z.string() })
);

export async function buscarCotacoes(): Promise<ResultadoCotacoes> {
  "use cache";

  try {
    const res = await fetchWithTimeout(URL_COTACOES, {
      headers: { accept: "application/json" },
      timeoutMs: PRAZO_COTACOES_MS,
    });
    if (!res.ok) {
      cacheLife("minutes");
      return { ok: false, mensagem: "Cotação ao vivo indisponível agora." };
    }
    const lido = esquemaResposta.safeParse(await res.json());
    if (!lido.success) {
      cacheLife("minutes");
      return { ok: false, mensagem: "Resposta inesperada do serviço de cotação." };
    }

    const taxas: Partial<Record<MoedaCotada, number>> = {};
    const momentos: string[] = [];
    for (const moeda of MOEDAS_COTADAS) {
      const par = lido.data[`${moeda}BRL`];
      const valor = par ? Number(par.bid) : NaN;
      if (Number.isFinite(valor) && valor > 0) {
        taxas[moeda] = valor;
        momentos.push(par.create_date);
      }
    }
    momentos.sort();
    if (Object.keys(taxas).length === 0) {
      cacheLife("minutes");
      return { ok: false, mensagem: "Cotação ao vivo indisponível agora." };
    }

    cacheLife("hours");
    return {
      ok: true,
      taxas,
      atualizadoDe: momentos[0],
      atualizadoAte: momentos[momentos.length - 1],
      fonte: "AwesomeAPI",
    };
  } catch {
    cacheLife("minutes");
    return { ok: false, mensagem: "Cotação ao vivo indisponível agora." };
  }
}
