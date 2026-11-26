import { sha256HexDoTexto } from "@/lib/finance/sha256";

/**
 * UUID estável a partir de um texto (versão 5 e variante RFC 4122, aceitos por
 * `z.uuid()`). Quando duas pessoas, aparelhos ou reenvios precisam chegar ao
 * MESMO registro (lançar nas Finanças um custo do Roteiro, registrar o
 * pagamento de um acerto), o id sai do que identifica o fato, e não de um
 * sorteio. Assim a chave primária do banco faz a deduplicação: a segunda
 * criação cai em `23505` e é tratada como a mesma operação.
 */
export function uuidDeterministico(texto: string): string {
  const h = sha256HexDoTexto(texto);
  const variante = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
