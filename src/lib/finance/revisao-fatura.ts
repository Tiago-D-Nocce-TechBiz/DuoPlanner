import type { EnriquecimentoTransacao } from "./enriquecimento";
import {
  ICONE_POR_CATEGORIA,
  mesclarEnriquecimento,
  type CategoriaDuoFinance,
  type EdicoesManuais,
  type EscopoSugerido,
  type TransacaoAnalisada,
} from "./invoice-analyzer";

/**
 * Estado da revisão de uma fatura importada (puro, testável).
 *
 * Guarda as transações, o que a pessoa já mudou à mão e as linhas que ainda
 * esperam a IA (etapa 2, em segundo plano). `geracao` identifica a
 * importação: resposta atrasada de uma importação anterior, cancelada ou já
 * salva é descartada, sem sobrescrever a tela atual.
 */

export interface EstadoRevisao {
  geracao: number;
  transacoes: TransacaoAnalisada[];
  editadas: EdicoesManuais;
  aguardandoIa: ReadonlySet<string>;
}

export type AcaoRevisao =
  | { tipo: "carregar"; geracao: number; transacoes: TransacaoAnalisada[]; aguardandoIa: readonly string[] }
  | { tipo: "limpar"; geracao: number }
  /** Resposta de um lote da IA; `lote` = ids enviados (os omitidos ficam com a categoria local). */
  | { tipo: "enriquecer"; geracao: number; itens: readonly EnriquecimentoTransacao[]; lote: readonly string[] }
  /** A IA parou (ou falhou num lote): estas linhas, ou todas, ficam com a categoria local. */
  | { tipo: "liberar"; geracao: number; ids?: readonly string[] }
  | { tipo: "categoria"; id: string; category: CategoriaDuoFinance }
  | { tipo: "escopo"; ids: readonly string[]; escopo: EscopoSugerido };

const vazias = (): EdicoesManuais => ({ categoria: new Set(), escopo: new Set() });

export const REVISAO_VAZIA: EstadoRevisao = {
  geracao: 0,
  transacoes: [],
  editadas: vazias(),
  aguardandoIa: new Set(),
};

function semAguardar(atual: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> {
  if (ids.every((id) => !atual.has(id))) return atual;
  const proximo = new Set(atual);
  for (const id of ids) proximo.delete(id);
  return proximo;
}

export function reduzirRevisao(estado: EstadoRevisao, acao: AcaoRevisao): EstadoRevisao {
  switch (acao.tipo) {
    case "carregar":
      return {
        geracao: acao.geracao,
        transacoes: acao.transacoes,
        editadas: vazias(),
        aguardandoIa: new Set(acao.aguardandoIa),
      };
    case "limpar":
      return { ...REVISAO_VAZIA, editadas: vazias(), geracao: acao.geracao };
    case "enriquecer":
      if (acao.geracao !== estado.geracao) return estado;
      return {
        ...estado,
        transacoes: mesclarEnriquecimento(estado.transacoes, [...acao.itens], "ia", estado.editadas),
        aguardandoIa: semAguardar(estado.aguardandoIa, acao.lote),
      };
    case "liberar":
      if (acao.geracao !== estado.geracao || estado.aguardandoIa.size === 0) return estado;
      return { ...estado, aguardandoIa: acao.ids ? semAguardar(estado.aguardandoIa, acao.ids) : new Set() };
    case "categoria":
      return {
        ...estado,
        editadas: { ...estado.editadas, categoria: new Set(estado.editadas.categoria).add(acao.id) },
        transacoes: estado.transacoes.map((t) =>
          t.id === acao.id ? { ...t, category: acao.category, categoryIcon: ICONE_POR_CATEGORIA[acao.category] } : t
        ),
      };
    case "escopo": {
      const alvo = new Set(acao.ids);
      const escopo = new Set(estado.editadas.escopo);
      for (const id of acao.ids) escopo.add(id);
      return {
        ...estado,
        editadas: { ...estado.editadas, escopo },
        transacoes: estado.transacoes.map((t) =>
          alvo.has(t.id) && t.suggestedScope !== acao.escopo ? { ...t, suggestedScope: acao.escopo } : t
        ),
      };
    }
  }
}
