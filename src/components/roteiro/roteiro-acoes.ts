import type { RoteiroDia, RoteiroItem } from "@/lib/sync/modelos";
import { criarRegistro, getRegistros } from "@/lib/sync/motor";

/** Gravações simples do Roteiro, usadas pela barra de ações e pela lista. */

const proximaOrdem = (lista: { ordem: number }[]) => lista.reduce((max, x) => Math.max(max, x.ordem), -1) + 1;
const agora = () => new Date().toISOString();

/** Novo dia no fim do roteiro (a ordem é lida na hora, com os dias que o par acabou de criar). */
export function adicionarDia(userId: string, ws: string) {
  const dia: RoteiroDia = {
    id: crypto.randomUUID(),
    workspaceId: ws,
    userId,
    data: null,
    ordem: proximaOrdem(getRegistros("roteiro_dias")),
    atualizadoEm: agora(),
    atualizadoPor: userId,
  };
  criarRegistro("roteiro_dias", dia);
}

/** Nova atividade no fim do dia (ordem lida na hora, com as do par recém-chegadas). */
export function adicionarAtividade(userId: string, ws: string, diaId: string) {
  const doDia = getRegistros("roteiro_itens").filter((i) => i.diaId === diaId);
  const item: RoteiroItem = {
    id: crypto.randomUUID(),
    workspaceId: ws,
    diaId,
    horario: "",
    titulo: "",
    nota: "",
    ordem: proximaOrdem(doDia),
    atualizadoEm: agora(),
    atualizadoPor: userId,
  };
  criarRegistro("roteiro_itens", item);
}
