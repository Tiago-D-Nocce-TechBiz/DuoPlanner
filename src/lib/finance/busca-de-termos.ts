/**
 * Busca de termos por palavra inteira, com prioridade: dadas entradas em
 * ordem (cada uma com seus termos), qual é a primeira que tem algum termo
 * dentro do texto. Usada pelo dicionário de estabelecimentos da fatura.
 *
 * Termos e texto já chegam normalizados como " palavra palavra " (espaço nas
 * pontas, um espaço entre palavras): `texto.includes(termo)` vale como
 * "aparece como palavras inteiras".
 *
 * Mesmo resultado de `entradas.findIndex((termos) => termos.some((t) =>
 * texto.includes(t)))`, sem varrer todos os termos: um termo só aparece no
 * texto se a primeira palavra dele for uma palavra do texto, então basta
 * olhar os termos que começam por uma das palavras do texto. Conferido contra
 * a varredura em `busca-de-termos.test.ts`.
 */
export function criarBuscaDeTermos(entradas: readonly (readonly string[])[]): (texto: string) => number {
  const porPrimeiraPalavra = new Map<string, { posicao: number; termo: string }[]>();
  entradas.forEach((termos, posicao) => {
    for (const termo of termos) {
      const primeira = termo.trim().split(" ")[0];
      // Termo vazio (só espaços) não casa com nada: não há palavra a procurar.
      if (!primeira) continue;
      const lista = porPrimeiraPalavra.get(primeira);
      if (lista) lista.push({ posicao, termo });
      else porPrimeiraPalavra.set(primeira, [{ posicao, termo }]);
    }
  });

  return function primeiraEntrada(texto: string): number {
    let melhor = -1;
    for (const palavra of texto.trim().split(" ")) {
      const candidatos = porPrimeiraPalavra.get(palavra);
      if (!candidatos) continue;
      for (const c of candidatos) {
        if ((melhor < 0 || c.posicao < melhor) && texto.includes(c.termo)) melhor = c.posicao;
      }
    }
    return melhor;
  };
}
