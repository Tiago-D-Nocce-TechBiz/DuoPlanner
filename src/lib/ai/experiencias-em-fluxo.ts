import { parsePartialJson } from "@langchain/core/output_parsers";
import { z } from "zod";
import {
  CAMPOS_EXPERIENCIA,
  QUANTIDADE_EXPERIENCIAS,
  type LocalGem,
  type RascunhoExperiencia,
} from "./experiencias-protocolo";

/**
 * Peças puras do fluxo das "Experiências Ocultas" no servidor (sem Gemini,
 * sem rede): o esquema de cada sugestão e o extrator que lê o JSON que a IA
 * ainda está escrevendo. Testadas em `experiencias-em-fluxo.test.ts`.
 *
 * A ordem das chaves no esquema é a ordem em que o Gemini as escreve (o
 * `responseJsonSchema` preserva a ordem): o nome chega primeiro, e o
 * rascunho na tela começa pelo título.
 */

export type { LocalGem } from "./experiencias-protocolo";

export const localGemSchema = z.object({
  nome: z.string().describe("Nome do lugar ou da experiência"),
  descricao: z.string().describe("O que fazer ali, em 1 ou 2 frases"),
  custo: z.enum(["gratuito", "baixo custo"]),
  custo_estimado: z
    .string()
    .describe("Ex.: 'Grátis' ou 'R$ 20–40 por pessoa' (converta moeda local para R$ aproximado)"),
  melhor_momento: z.string().describe("Melhor dia, horário ou época para ir"),
  dica_local: z.string().describe("Dica de quem conhece: como chegar, o que levar ou o que evitar"),
}) satisfies z.ZodType<LocalGem>;

export const gemsOutputSchema = z.object({
  experiencias: z.array(localGemSchema).min(QUANTIDADE_EXPERIENCIAS).max(QUANTIDADE_EXPERIENCIAS),
});

export interface LeituraDoFluxo {
  /** Sugestões que acabaram de ficar completas e válidas, com a posição. */
  prontas: { indice: number; experiencia: LocalGem }[];
  /** A sugestão em escrita, só quando o texto dela mudou desde a última leitura. */
  rascunho: { indice: number; experiencia: RascunhoExperiencia } | null;
}

/** Só os campos de texto conhecidos; o resto do objeto parcial é ignorado. */
function rascunhoDe(item: unknown): RascunhoExperiencia | null {
  if (typeof item !== "object" || item === null) return null;
  const origem = item as Record<string, unknown>;
  const rascunho: RascunhoExperiencia = {};
  let algum = false;
  for (const campo of CAMPOS_EXPERIENCIA) {
    const valor = origem[campo];
    if (typeof valor === "string" && valor) {
      rascunho[campo] = valor;
      algum = true;
    }
  }
  return algum ? rascunho : null;
}

/**
 * Lê o JSON parcial `{"experiencias":[{...},{...` a cada trecho (o texto
 * acumulado, não só o trecho novo).
 *
 * Enquanto a resposta não termina, a última do array pode estar pela
 * metade: sai como rascunho e só vira "pronta" quando a seguinte começa (ou
 * no fim). Sugestão fora do formato é descartada sem travar as demais.
 */
export function criarExtratorDeExperiencias() {
  let vistas = 0;
  let ultimoRascunho = "";
  return function ler(texto: string, terminou = false): LeituraDoFluxo {
    const leitura: LeituraDoFluxo = { prontas: [], rascunho: null };
    let parcial: unknown;
    try {
      parcial = parsePartialJson(texto);
    } catch {
      return leitura;
    }
    const lista = (parcial as { experiencias?: unknown } | null)?.experiencias;
    if (!Array.isArray(lista)) return leitura;

    const completas = Math.min(terminou ? lista.length : lista.length - 1, QUANTIDADE_EXPERIENCIAS);
    for (; vistas < completas; vistas++) {
      const lida = localGemSchema.safeParse(lista[vistas]);
      if (lida.success) leitura.prontas.push({ indice: vistas, experiencia: lida.data });
    }

    // A que está sendo escrita é a última do array (ainda dentro das 3).
    if (!terminou && vistas === lista.length - 1 && vistas < QUANTIDADE_EXPERIENCIAS) {
      const rascunho = rascunhoDe(lista[vistas]);
      const assinatura = rascunho ? `${vistas}:${JSON.stringify(rascunho)}` : "";
      if (rascunho && assinatura !== ultimoRascunho) {
        ultimoRascunho = assinatura;
        leitura.rascunho = { indice: vistas, experiencia: rascunho };
      }
    }
    return leitura;
  };
}
