import { analiseLocal } from "@/lib/ai/nora-strategies-local";
import { CONTEXTO_VAZIO, type EstrategiaId, type ResultadoAdvisor } from "@/lib/ai/nora-strategies";
import type { ResultadoAcao } from "@/lib/acoes/resultado";

type Consultar = (entrada: { estrategia: EstrategiaId; texto: string }) => Promise<ResultadoAcao<ResultadoAdvisor>>;

/**
 * Chama a Server Action da Nora sob demanda (o código só baixa no primeiro
 * uso). Se a ação falhar ou o aparelho estiver sem conexão, devolve a lista
 * de conferência local: a gaveta nunca fica sem resposta.
 */
export async function consultarComFallback(
  estrategia: EstrategiaId,
  texto: string,
  consultar?: Consultar
): Promise<ResultadoAdvisor> {
  try {
    const executar = consultar ?? (await import("@/app/dashboard/nora-advisor-actions")).consultarNora;
    const r = await executar({ estrategia, texto });
    if (r.success) return r.data;
    return localComAviso(estrategia, r.code === "NAO_AUTENTICADO" ? "Entre na sua conta para a Nora analisar a viagem. Enquanto isso, esta é a lista de conferência." : r.error);
  } catch {
    return localComAviso(estrategia, "Sem conexão com a Nora agora. Esta é a lista de conferência, que funciona offline.");
  }
}

function localComAviso(estrategia: EstrategiaId, aviso: string): ResultadoAdvisor {
  return {
    tipo: "analise",
    estrategia,
    origem: "local",
    analise: analiseLocal(estrategia, CONTEXTO_VAZIO),
    contexto: CONTEXTO_VAZIO,
    aviso,
  };
}
