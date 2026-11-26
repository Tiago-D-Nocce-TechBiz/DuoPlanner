import { uuidDeterministico } from "@/lib/id-deterministico";
import type { Categoria } from "@/lib/finance/classificar";
import type { NovaDespesa } from "@/lib/finance/store";
import type { RoteiroItem } from "@/lib/sync/modelos";
import { LIMITES_ROTEIRO } from "./tipos";

/**
 * Do Roteiro para o DuoFinance: o custo estimado de uma atividade (ou de um
 * dia inteiro) vira um gasto, depois de a pessoa confirmar escopo, valor e
 * data.
 *
 * Sem duplicar: o gasto de uma atividade tem um id DETERMINÍSTICO (hash do
 * item e do escopo). Lançar de novo, de outro aparelho, ou reenviar uma
 * operação perdida cai na mesma chave primária e o servidor a trata como a
 * mesma criação. A tela também esconde o botão de quem já foi lançado:
 *  - compartilhado: o id não depende de quem lançou, então o par enxerga o
 *    gasto do outro e não lança de novo;
 *  - só meu: o id inclui a pessoa (o gasto privado do par nem é visível).
 * Lançar o dia inteiro cria um gasto por atividade (cada uma com a própria
 * categoria), todos na mesma confirmação.
 */

export type EscopoLancamento = "compartilhado" | "privado";

export { uuidDeterministico };

// A lista recalcula os ids a cada mudança do roteiro (uma tecla, por exemplo): o cache evita refazer o hash.
const CACHE_DE_IDS = new Map<string, string>();
const TETO_DO_CACHE = 5_000;

export function idDoLancamento(itemId: string, escopo: EscopoLancamento, userId: string): string {
  const texto = escopo === "compartilhado" ? `roteiro-gasto|${itemId}|compartilhado` : `roteiro-gasto|${itemId}|privado|${userId}`;
  let id = CACHE_DE_IDS.get(texto);
  if (!id) {
    if (CACHE_DE_IDS.size >= TETO_DO_CACHE) CACHE_DE_IDS.clear();
    id = uuidDeterministico(texto);
    CACHE_DE_IDS.set(texto, id);
  }
  return id;
}

/** O item já virou gasto (compartilhado, de qualquer um, ou privado da própria pessoa)? */
export function jaLancado(itemId: string, userId: string, idsDeGastos: ReadonlySet<string>): boolean {
  return idsDeGastos.has(idDoLancamento(itemId, "compartilhado", userId)) || idsDeGastos.has(idDoLancamento(itemId, "privado", userId));
}

const CATEGORIA_FINANCEIRA: Record<string, Categoria> = {
  Praia: "Passeios & Lazer",
  Passeio: "Passeios & Lazer",
  Gastronomia: "Alimentação & Gastronomia",
  Transporte: "Passagens & Transporte",
  Hospedagem: "Hospedagem",
};

export function categoriaFinanceira(categoriaDoRoteiro: string | null | undefined): Categoria {
  return CATEGORIA_FINANCEIRA[categoriaDoRoteiro ?? ""] ?? "Passeios & Lazer";
}

/** Atividades que podem ser lançadas: têm custo estimado maior que zero e ainda não viraram gasto. */
export function itensLancaveis<T extends Pick<RoteiroItem, "id" | "custoEstimado">>(itens: readonly T[], userId: string, idsDeGastos: ReadonlySet<string>): T[] {
  return itens.filter((i) => (i.custoEstimado ?? 0) > 0 && !jaLancado(i.id, userId, idsDeGastos));
}

export interface PedidoDeLancamento {
  itens: { item: Pick<RoteiroItem, "id" | "titulo" | "categoria">; valor: number }[];
  escopo: EscopoLancamento;
  /** Data do dia do roteiro (AAAA-MM-DD) ou null. */
  dataDoDia: string | null;
  hojeIso: string;
  destino?: string | null;
  userId: string;
}

/** Os gastos que a confirmação cria: valor positivo, categoria do app, id estável. */
export function montarLancamentos(p: PedidoDeLancamento): (NovaDespesa & { id: string })[] {
  const sufixo = p.destino?.trim() ? ` · ${p.destino.trim()}` : "";
  return p.itens
    .filter((x) => Number.isFinite(x.valor) && x.valor > 0 && x.valor <= LIMITES_ROTEIRO.custoMaximo)
    .map(({ item, valor }) => ({
      id: idDoLancamento(item.id, p.escopo, p.userId),
      descricao: `${item.titulo.trim() || "Atividade do roteiro"} (Roteiro${sufixo})`.slice(0, 120),
      valor,
      moeda: "BRL",
      data: p.dataDoDia ?? p.hojeIso,
      categoria: categoriaFinanceira(item.categoria),
      escopo: p.escopo === "compartilhado" ? ("viagem_compartilhado" as const) : ("pessoal_privado" as const),
      origem: "manual" as const,
    }));
}

/** O que a tela mostra na confirmação: um item ou o dia inteiro. */
export interface PedidoNaTela {
  /** "Dia 2" ou o título da atividade. */
  rotulo: string;
  itens: { id: string; titulo: string; categoria: string | null; valor: number }[];
  dataDoDia: string | null;
  destino: string | null;
}
