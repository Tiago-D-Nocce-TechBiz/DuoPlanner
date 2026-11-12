import type * as AcaoIa from "@/app/dashboard/financas/analyze-invoice";
import type * as Store from "@/lib/finance/store";
import { ACORDO_PADRAO, type ContextoSincronizacao } from "@/lib/sync/contexto";
import type * as Motor from "@/lib/sync/motor";

/**
 * Substitutos do motor de sincronização, do store de gastos e da Server
 * Action da IA, para medir o importador isolado (`importador-producao.spec.ts`).
 * Os tipos vêm dos módulos reais: se a assinatura mudar lá, o type-check
 * acusa aqui. Sem rede e sem fila.
 */

const CONTEXTO: ContextoSincronizacao = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "ana@teste.dev",
  workspace: { id: "33333333-3333-4333-8333-333333333333", nome: "Lisboa 2027", papel: "dono" },
  membros: [],
  perfil: null,
  acordo: ACORDO_PADRAO,
  servidorPronto: false,
  criptografiaDocumentos: false,
  iaAtiva: true,
};
const SEM_DESPESAS: ReturnType<typeof Store.useDespesas> = [];

export const useContextoSync: typeof Motor.useContextoSync = () => CONTEXTO;
export const useDespesas: typeof Store.useDespesas = () => SEM_DESPESAS;
export const criarDespesa: typeof Store.criarDespesa = () => null;
/** A IA nunca responde: a etapa 2 fica pendente e não entra na medição. */
export const enriquecerTransacoes: typeof AcaoIa.enriquecerTransacoes = () => new Promise(() => {});
