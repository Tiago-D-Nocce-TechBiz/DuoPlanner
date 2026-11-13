/**
 * Corpo da requisição como texto, com teto em bytes: passou do teto, para de
 * ler e devolve `null` (a rota responde 413). Protege as rotas POST de um
 * corpo gigante ocupando a memória da função antes da validação.
 *
 * O `Content-Length` declarado é conferido antes (recusa sem ler nada), mas
 * não basta: com `Transfer-Encoding: chunked` ele não vem, então a contagem
 * real é feita durante a leitura.
 */
export async function lerCorpoLimitado(requisicao: Request, maximoBytes: number): Promise<string | null> {
  const declarado = Number(requisicao.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maximoBytes) return null;
  if (!requisicao.body) return "";

  const leitor = requisicao.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximoBytes) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    pedacos.push(value);
  }

  const junto = new Uint8Array(total);
  let posicao = 0;
  for (const pedaco of pedacos) {
    junto.set(pedaco, posicao);
    posicao += pedaco.byteLength;
  }
  return new TextDecoder().decode(junto);
}
