import { classificarDespesa, type Categoria, type Escopo } from "./classificar";

/**
 * Proposta de gasto lida de um recibo ou comprovante (puro, sem I/O).
 *
 * Compartilhado entre o agente de IA (servidor) e a tela de Finanças
 * (cliente): o agente devolve a proposta e o usuário revisa antes de salvar.
 *
 * Sem zod aqui de propósito: este módulo vai para o navegador. O esquema que
 * valida a saída da IA fica no servidor (`@/lib/ai/recibo-esquema`) e é
 * conferido contra este tipo com `satisfies`.
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

export interface PropostaRecibo {
  titulo: string;
  estabelecimento: string;
  valor: number;
  /** AAAA-MM-DD. */
  data: string;
  /** Código ISO de 3 letras. */
  moeda: string;
  categoria: Categoria;
  tipoComprovante: TipoComprovante;
}

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
