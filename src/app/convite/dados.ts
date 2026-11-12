import "server-only";
import type { Sessao } from "@/lib/auth/sessao";
import { funcaoRpcAusente } from "@/lib/auth/seguranca";

export interface InfoConvite {
  valido: boolean;
  mensagem: string;
  nomeEspaco?: string;
  nomeConvidante?: string;
  /** false quando a RPC ainda não existe (migration pendente). */
  detalhado: boolean;
}

/**
 * Dados públicos do convite para a tela de confirmação (quem convidou e o
 * nome do espaço), via RPC `obter_convite`, sem expor a tabela.
 *
 * Leitura do Server Component da página, não uma Server Action: antes ficava
 * no arquivo "use server" e virava um endpoint público a mais.
 */
export async function obterConvite(codigo: string, sessao: Sessao): Promise<InfoConvite> {
  const rpc = await sessao.supabase.rpc("obter_convite", { p_codigo: codigo });
  if (rpc.error) {
    if (funcaoRpcAusente(rpc.error)) return { valido: true, mensagem: "", detalhado: false };
    console.error("[convites] falha ao consultar convite:", rpc.error.message);
    return { valido: false, mensagem: "Não foi possível consultar o convite agora.", detalhado: true };
  }
  const linha = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as
    | { valido?: boolean; mensagem?: string; nome_espaco?: string; nome_convidante?: string }
    | null;
  return {
    valido: Boolean(linha?.valido),
    mensagem: String(linha?.mensagem ?? ""),
    nomeEspaco: linha?.nome_espaco ?? undefined,
    nomeConvidante: linha?.nome_convidante ?? undefined,
    detalhado: true,
  };
}
