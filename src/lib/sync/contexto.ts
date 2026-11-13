import type { RegraDivisao } from "@/lib/finance/acerto";
import type { TipoChavePix } from "@/lib/pix/brcode";

/**
 * Contexto da sincronização (tipos puros, compartilhados servidor ↔ cliente):
 * quem está logado, o espaço do casal, os dois integrantes (nome e Pix para
 * o acerto), o acordo de divisão e se o banco já tem as tabelas novas.
 */

export interface PixRecebimento {
  tipo: TipoChavePix;
  chave: string;
  nomeRecebedor: string;
  cidade: string;
}

export interface Membro {
  userId: string;
  nome: string;
  papel: "dono" | "parceiro";
  pix: PixRecebimento | null;
}

export interface PerfilProprio {
  nome: string;
  cidadeBase: string;
  iataBase: string;
  pix: PixRecebimento | null;
  emailAlertas: boolean;
  emailResumoSemanal: boolean;
}

export interface AcordoDivisao {
  regra: "igual" | "proporcional" | "fixo";
  /** Proporcional: parte (%) do dono do espaço. */
  percentualDono: number;
  /** Fixo: quanto `quemCobreFixo` arca do total (o outro, o restante). */
  valorFixo: number | null;
  quemCobreFixo: "dono" | "parceiro";
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface ContextoSincronizacao {
  userId: string;
  email: string | null;
  workspace: { id: string; nome: string; papel: "dono" | "parceiro" } | null;
  membros: Membro[];
  perfil: PerfilProprio | null;
  acordo: AcordoDivisao;
  /** As tabelas da migration de sincronização existem no banco. */
  servidorPronto: boolean;
  /** DOCUMENTOS_CHAVE_CRIPTO configurada (número completo pode ser guardado). */
  criptografiaDocumentos: boolean;
  /**
   * IA (Gemini) ligada no servidor. Sem ela, o importador de fatura nem
   * tenta a etapa 2. Opcional: contextos guardados por versões anteriores
   * não têm o campo (vale "talvez", e a tentativa responde sem gastar cota).
   */
  iaAtiva?: boolean;
}

/** Colunas de `acordos_divisao` que `acordoDaLinha` lê (nada de `select("*")`). */
export const COLUNAS_ACORDO = "workspace_id, regra, percentual_dono, valor_fixo, quem_cobre_fixo, atualizado_em, atualizado_por";

export const ACORDO_PADRAO: AcordoDivisao = {
  regra: "igual",
  percentualDono: 50,
  valorFixo: null,
  quemCobreFixo: "dono",
  atualizadoEm: null,
  atualizadoPor: null,
};

export function regraDoAcordo(acordo: AcordoDivisao): RegraDivisao {
  if (acordo.regra === "proporcional") return { regra: "proporcional", percentualDono: acordo.percentualDono };
  if (acordo.regra === "fixo" && acordo.valorFixo !== null) {
    return { regra: "fixo", valorFixo: acordo.valorFixo, quemCobre: acordo.quemCobreFixo };
  }
  return { regra: "igual" };
}

export function acordoDaLinha(l: Record<string, unknown> | null | undefined): AcordoDivisao {
  if (!l) return ACORDO_PADRAO;
  const regra = l.regra === "proporcional" || l.regra === "fixo" ? l.regra : "igual";
  const percentual = Number(l.percentual_dono);
  const fixo = l.valor_fixo === null || l.valor_fixo === undefined ? null : Number(l.valor_fixo);
  return {
    regra,
    percentualDono: Number.isFinite(percentual) ? percentual : 50,
    valorFixo: fixo !== null && Number.isFinite(fixo) ? fixo : null,
    quemCobreFixo: l.quem_cobre_fixo === "parceiro" ? "parceiro" : "dono",
    atualizadoEm: typeof l.atualizado_em === "string" ? l.atualizado_em : null,
    atualizadoPor: typeof l.atualizado_por === "string" ? l.atualizado_por : null,
  };
}

/** Os dois papéis do casal (null enquanto o par não entrou no espaço). */
export function papeisDoCasal(membros: Membro[]): { dono: Membro; parceiro: Membro } | null {
  const dono = membros.find((m) => m.papel === "dono");
  const parceiro = membros.find((m) => m.papel === "parceiro");
  return dono && parceiro ? { dono, parceiro } : null;
}
