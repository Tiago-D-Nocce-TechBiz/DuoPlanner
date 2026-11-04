import { z } from "zod";
import {
  CATEGORIAS,
  classificarDespesa,
  type Categoria,
  type Escopo,
} from "./classificar";

/**
 * Proposta de gasto lida de um recibo ou comprovante (puro, sem I/O).
 *
 * Compartilhado entre o agente de IA (servidor) e a tela de Finanças
 * (cliente): o agente devolve a proposta e o usuário revisa antes de salvar.
 */

export const TIPOS_COMPROVANTE = [
  "recibo",
  "nota_fiscal",
  "cupom",
  "comprovante_pix",
  "comprovante_cartao",
  "outro",
] as const;

export type TipoComprovante = (typeof TIPOS_COMPROVANTE)[number];

export const propostaReciboSchema = z.object({
  titulo: z.string().min(1).max(80),
  estabelecimento: z.string().max(80),
  valor: z.number().min(0.01).max(1_000_000),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  moeda: z.string().regex(/^[A-Z]{3}$/),
  categoria: z.enum(CATEGORIAS),
  tipoComprovante: z.enum(TIPOS_COMPROVANTE),
});

export type PropostaRecibo = z.infer<typeof propostaReciboSchema>;

/**
 * Escopo sugerido: as regras do classificador (palavra inteira) vencem; se
 * nenhuma reconhece o texto, vale a categoria lida pela IA. Gasto pessoal
 * fica privado. O usuário pode trocar antes de confirmar.
 */
export function escopoSugeridoParaRecibo(proposta: Pick<PropostaRecibo, "titulo" | "estabelecimento" | "categoria">): {
  categoria: Categoria;
  escopo: Escopo;
} {
  const pelasRegras = classificarDespesa(`${proposta.estabelecimento} ${proposta.titulo}`);
  if (pelasRegras.escopo === "viagem_compartilhado") return pelasRegras;
  if (proposta.categoria === "Gasto Pessoal (Fora da Viagem)") {
    return { categoria: proposta.categoria, escopo: "pessoal_privado" };
  }
  return { categoria: proposta.categoria, escopo: "viagem_compartilhado" };
}
