/**
 * Validação fail-fast do ambiente em cada instância do servidor.
 *
 * O Next chama `register` uma vez por instância, antes de atender qualquer
 * pedido (no `next dev`, no `next start` e em cada função da Vercel ao
 * iniciar). O build já foi barrado pelo `next.config.ts` com as variáveis do
 * build; aqui a checagem cobre o ambiente de execução, que pode ser outro
 * (imagem construída uma vez e executada com variáveis diferentes). Variável
 * ausente não é erro: a integração entra em modo degradado e o relatório diz
 * o que muda.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { analisarAmbiente, descreverAmbiente, ErroDeAmbiente } = await import("@/lib/env/esquema");
  const resultado = analisarAmbiente(process.env);
  if (!resultado.ok) throw new ErroDeAmbiente(resultado.erros);
  console.info(descreverAmbiente(resultado));

  // Aviso estruturado no log para requisição, rota de API ou Server Action
  // que passar de 1,5 s (OpenTelemetry, sem coletor externo).
  await import("./instrumentation.node");
}
