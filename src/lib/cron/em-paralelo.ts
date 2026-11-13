/**
 * Executa `tarefa` para cada item com no máximo `limite` em andamento ao
 * mesmo tempo (fila de trabalhadores). Puro.
 *
 * Usado pelas tarefas agendadas para trocar N chamadas em sequência (uma por
 * pessoa ou alerta) por poucas rodadas, sem disparar tudo de uma vez contra
 * um provedor com limite de requisições.
 */
export async function emParalelo<T>(itens: readonly T[], limite: number, tarefa: (item: T) => Promise<void>): Promise<void> {
  if (!Number.isSafeInteger(limite) || limite < 1) throw new RangeError(`limite inválido: ${limite}`);
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (proximo < itens.length) {
      const item = itens[proximo++];
      await tarefa(item);
    }
  });
  await Promise.all(trabalhadores);
}
