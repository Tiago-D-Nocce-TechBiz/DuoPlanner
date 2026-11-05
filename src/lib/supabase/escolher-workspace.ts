/**
 * Qual espaço vale para a pessoa quando ela participa de mais de um (puro).
 *
 * Quem aceitou um convite fica no espaço COMPARTILHADO (papel "parceiro"),
 * não no espaço vazio criado no primeiro acesso; empate → o primeiro da
 * lista, que vem do vínculo mais recente para o mais antigo. O painel
 * (`getWorkspaceAtual`) e o resumo semanal usam a mesma regra, para o e-mail
 * falar do mesmo espaço que a pessoa vê na tela.
 */
export function escolherWorkspace<T extends { papel: string; workspaces: unknown }>(lista: T[]): T | undefined {
  const validos = lista.filter((m) => m.workspaces);
  return validos.find((m) => m.papel === "parceiro") ?? validos[0];
}
