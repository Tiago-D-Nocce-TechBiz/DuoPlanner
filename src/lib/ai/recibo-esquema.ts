import "server-only";
import { z } from "zod";
import { CATEGORIAS } from "@/lib/finance/classificar";
import { TIPOS_COMPROVANTE, type PropostaRecibo } from "@/lib/finance/recibo";

/**
 * Validação da proposta lida pela IA (servidor). O `satisfies` garante que o
 * esquema e o tipo `PropostaRecibo` (usado no navegador, sem zod) não
 * divergem: um campo a mais ou a menos de um lado quebra o build.
 */
export const propostaReciboSchema = z.object({
  titulo: z.string().min(1).max(80),
  estabelecimento: z.string().max(80),
  valor: z.number().min(0.01).max(1_000_000),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  moeda: z.string().regex(/^[A-Z]{3}$/),
  categoria: z.enum(CATEGORIAS),
  tipoComprovante: z.enum(TIPOS_COMPROVANTE),
}) satisfies z.ZodType<PropostaRecibo>;
