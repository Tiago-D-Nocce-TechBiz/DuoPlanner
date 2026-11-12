import type { EnriquecimentoSemantico, TransacaoAnalisada } from "./invoice-analyzer";

/**
 * Etapa 2 da importação de fatura: IA em segundo plano (parte pura).
 *
 * A etapa 1 (regex + catálogo local, no navegador) já mostrou o Raio-X e a
 * tabela. Aqui saem só as linhas que o catálogo NÃO identificou com certeza,
 * em lotes pequenos: cada lote é uma chamada ao Gemini e uma unidade da cota
 * "ia". Os limites são os mesmos que a Server Action valida
 * (`app/dashboard/financas/analyze-invoice.ts`).
 */

export const TAMANHO_LOTE_IA = 40;
/** Lotes em paralelo: resposta progressiva sem estourar o limite do provedor. */
export const LOTES_SIMULTANEOS_IA = 2;
export const LIMITES_LINHA_IA = { descricao: 300, nome: 120, valorMaximo: 1_000_000 } as const;

/** Entrada mínima enviada à IA: sem dados da pessoa, só o que categoriza. */
export interface TransacaoParaEnriquecer {
  id: string;
  descricaoOriginal: string;
  cleanMerchantName: string;
  valor: number;
  moeda: string;
}

/** O que a IA devolve por linha. */
export type EnriquecimentoTransacao = EnriquecimentoSemantico;

/**
 * Linhas que vão para a IA: não reconhecidas pelo catálogo, que contam no
 * cálculo e que não serão puladas (já importadas não gastam cota). Texto
 * cortado nos limites do servidor; valor acima do teto fica com a categoria
 * local (o lote inteiro seria recusado).
 */
export function linhasParaIa(
  transacoes: readonly TransacaoAnalisada[],
  pular: ReadonlySet<string>
): TransacaoParaEnriquecer[] {
  return transacoes
    .filter(
      (t) =>
        !t.reconhecidoLocalmente &&
        !t.ignorarNoCalculo &&
        !pular.has(t.id) &&
        t.valor >= 0 &&
        t.valor <= LIMITES_LINHA_IA.valorMaximo
    )
    .map((t) => ({
      id: t.id,
      descricaoOriginal: t.descricaoOriginal.slice(0, LIMITES_LINHA_IA.descricao),
      cleanMerchantName: t.cleanMerchantName.slice(0, LIMITES_LINHA_IA.nome),
      valor: t.valor,
      moeda: t.moeda,
    }));
}

export function emLotes<T>(itens: readonly T[], tamanho = TAMANHO_LOTE_IA): T[][] {
  if (!Number.isSafeInteger(tamanho) || tamanho < 1) throw new RangeError(`Tamanho de lote inválido: ${tamanho}.`);
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Roda `tarefa` em cada lote, na ordem, com no máximo `simultaneos` ao mesmo
 * tempo. Para de iniciar lotes quando `parar()` devolve true (IA desligada,
 * cota esgotada, sessão expirada ou importação cancelada); os que já saíram
 * terminam normalmente. `tarefa` trata os próprios erros: aqui uma rejeição
 * interromperia os demais lotes.
 */
export async function executarEmLotes<T>(
  lotes: readonly T[],
  simultaneos: number,
  tarefa: (lote: T) => Promise<void>,
  parar: () => boolean = () => false
): Promise<void> {
  let proximo = 0;
  const trabalhador = async () => {
    while (!parar() && proximo < lotes.length) {
      const lote = lotes[proximo++];
      await tarefa(lote);
    }
  };
  const quantos = Math.max(1, Math.min(simultaneos, lotes.length));
  await Promise.all(Array.from({ length: quantos }, trabalhador));
}
