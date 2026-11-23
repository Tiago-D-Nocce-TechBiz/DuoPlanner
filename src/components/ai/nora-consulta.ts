import { CUSTOS_VAZIOS, type ResumoDeCustos } from "@/lib/ai/cost-agent-metrics";
import { analiseLocal } from "@/lib/ai/nora-strategies-local";
import { CONTEXTO_VAZIO, ESTRATEGIAS_COM_PAINEL_DE_CUSTOS, type EstrategiaId, type ResultadoAdvisor } from "@/lib/ai/nora-strategies";
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
    return await localComAviso(estrategia, r.code === "NAO_AUTENTICADO" ? "Entre na sua conta para a Nora analisar a viagem. Enquanto isso, esta é a lista de conferência." : r.error);
  } catch {
    return await localComAviso(estrategia, "Sem conexão com a Nora agora. Esta é a lista de conferência, que funciona offline.");
  }
}

/**
 * A lista de conferência local. Na gestão de custos, os números vêm do que o
 * aparelho já guardou (sem IA e sem servidor): o cálculo carrega sob demanda.
 */
async function localComAviso(estrategia: EstrategiaId, aviso: string): Promise<ResultadoAdvisor> {
  const comPainel = ESTRATEGIAS_COM_PAINEL_DE_CUSTOS.includes(estrategia);
  let custos: ResumoDeCustos | null = null;
  if (comPainel) {
    try {
      custos = (await import("./nora-custos-local")).custosDoAparelho();
    } catch {
      custos = CUSTOS_VAZIOS;
    }
  }
  return {
    tipo: "analise",
    estrategia,
    origem: "local",
    analise: analiseLocal(estrategia, CONTEXTO_VAZIO, custos ?? undefined),
    custos,
    contexto: CONTEXTO_VAZIO,
    aviso: comPainel ? `${aviso} Os números abaixo foram calculados com os dados guardados neste aparelho.` : aviso,
  };
}
