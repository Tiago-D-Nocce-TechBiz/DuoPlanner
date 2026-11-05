/**
 * Compras da fatura que já estão no DuoFinance (puro, testável).
 *
 * Quem importa a fatura depois da viagem costuma já ter lançado parte das
 * compras (à mão, pela Nora ou por recibo), ou importa a mesma fatura duas
 * vezes. Salvar de novo dobraria o gasto e o acerto de contas.
 *
 * Uma linha importada é "já lançada" quando existe um gasto com a MESMA
 * data, moeda e valor (ao centavo). Cada gasto existente casa com uma única
 * linha: se a fatura tem duas corridas iguais no mesmo dia e só uma foi
 * lançada, a segunda continua livre. É só uma sugestão: a tela deixa salvar
 * mesmo assim.
 */

export interface LinhaImportada {
  id: string;
  dataIso: string;
  valor: number;
  moeda: string;
}

export interface GastoExistente {
  data: string;
  valor: number;
  moeda: string;
  tipo: "gasto" | "acerto";
  descricao: string;
}

const chave = (data: string, moeda: string, valor: number) =>
  `${data}|${moeda.trim().toUpperCase()}|${Math.round(valor * 100)}`;

/** id da linha importada → descrição do gasto que já está lançado. */
export function encontrarJaLancados(linhas: LinhaImportada[], existentes: GastoExistente[]): Map<string, string> {
  const disponiveis = new Map<string, string[]>();
  for (const g of existentes) {
    if (g.tipo !== "gasto") continue;
    const k = chave(g.data, g.moeda, g.valor);
    const lista = disponiveis.get(k);
    if (lista) lista.push(g.descricao);
    else disponiveis.set(k, [g.descricao]);
  }
  const encontrados = new Map<string, string>();
  for (const l of linhas) {
    const descricao = disponiveis.get(chave(l.dataIso, l.moeda, l.valor))?.shift();
    if (descricao !== undefined) encontrados.set(l.id, descricao);
  }
  return encontrados;
}
