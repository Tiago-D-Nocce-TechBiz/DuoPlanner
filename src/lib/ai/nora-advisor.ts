import "server-only";
import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { Sessao } from "@/lib/auth/sessao";
import { todayInSaoPaulo } from "@/lib/dates";
import { integracaoAtiva } from "@/lib/env";
import { loadPreferencesSafe } from "@/lib/memory/store";
import { describePreferences } from "@/lib/memory/preferences";
import { consumirCota, type ResultadoCota } from "@/lib/seguranca/cotas";
import { getWorkspaceAtual } from "@/lib/supabase/workspace";
import { createGeminiModel } from "./model";
import { soCitaValoresConhecidos, valoresEmReaisDoTexto, type ResumoDeCustos } from "./cost-agent-metrics";
import {
  blocoDeCustos,
  carregarDadosBrutos,
  DADOS_VAZIOS,
  mensagemParaOModelo,
  paraContextoUsado,
  perguntaDeLacuna,
  resumirContexto,
  type DadosBrutos,
} from "./nora-contexto";
import { ESTRATEGIAS_COM_PAINEL_DE_CUSTOS, type AnaliseNora, type EstrategiaId, type ResultadoAdvisor } from "./nora-strategies";
import { analiseLocal, pontosDosSinais, recomendacaoDeCustos, resumoDeCustos } from "./nora-strategies-local";
import { analiseBaseSchema, esquemaDaEstrategia, promptDaEstrategia } from "./nora-strategies-servidor";

/**
 * As 9 estratégias da Nora ("Travel Hacks") no servidor:
 *
 *   contexto do casal (workspace) → falta algo? pergunta (sem gastar IA)
 *   → IA configurada e com cota? → Gemini em saída estruturada, com prazo de
 *   12 s → resposta validada para a estratégia → card.
 *
 * Qualquer problema (sem chave, cota esgotada, prazo estourado, resposta
 * fora do formato, IA fora do ar) devolve a lista de conferência local da
 * estratégia, já personalizada com o destino e as datas; nunca uma falha.
 */

/** Prazo da chamada à IA (o app inteiro segue em 8 s; as análises são mais longas). */
export const PRAZO_ADVISOR_MS = 12_000;

export interface ModeloAdvisor {
  invoke(mensagens: BaseMessage[], opcoes: { signal: AbortSignal }): Promise<unknown>;
}

export interface DependenciasAdvisor {
  hojeIso?: string;
  iaAtiva?: () => boolean;
  cota?: (sessao: Sessao) => Promise<ResultadoCota>;
  carregar?: (sessao: Sessao) => Promise<{ dados: DadosBrutos; preferencias: string[] }>;
  modelo?: ModeloAdvisor;
}

async function carregarDoWorkspace(sessao: Sessao): Promise<{ dados: DadosBrutos; preferencias: string[] }> {
  const workspace = await getWorkspaceAtual(sessao);
  if (!workspace) return { dados: DADOS_VAZIOS, preferencias: [] };
  const [dados, preferencias] = await Promise.all([
    carregarDadosBrutos(sessao.supabase, workspace.id),
    loadPreferencesSafe(sessao),
  ]);
  return { dados, preferencias: describePreferences(preferencias) };
}

function modeloGemini(): ModeloAdvisor {
  return createGeminiModel({ reasoningEffort: "low" }).withStructuredOutput(analiseBaseSchema, {
    method: "jsonSchema",
    name: "analise_nora",
  });
}

function foiPrazo(erro: unknown): boolean {
  const nome = typeof erro === "object" && erro !== null ? (erro as { name?: unknown }).name : undefined;
  return nome === "TimeoutError" || nome === "AbortError";
}

/**
 * Estratégias com painel de custos: os números são do app, não do modelo.
 * O que a IA devolve passa por aqui antes de ir para a tela:
 *  - nada de opções, nota, veredito, economia nem alerta (o painel do app mostra o detalhe);
 *  - os sinais calculados vêm primeiro, depois as leituras complementares da IA;
 *  - texto da IA que cita um valor em reais que o app não calculou é trocado
 *    pelo texto determinístico (e o card avisa).
 */
export function aplicarRegrasDeCustos(analise: AnaliseNora, custos: ResumoDeCustos): { analise: AnaliseNora; aviso: string | null } {
  const permitidos = new Set(valoresEmReaisDoTexto(blocoDeCustos(custos)));
  const confere = (texto: string) => soCitaValoresConhecidos(texto, permitidos);
  let trocou = false;
  const resumo = confere(analise.resumo) ? analise.resumo : ((trocou = true), resumoDeCustos(custos));
  const recomendacao = confere(analise.recomendacaoPratica) ? analise.recomendacaoPratica : ((trocou = true), recomendacaoDeCustos(custos));
  const complementares = analise.pontosDeAtencao.filter((p) => {
    const ok = confere(`${p.titulo} ${p.detalhe}`);
    if (!ok) trocou = true;
    return ok;
  });
  return {
    analise: {
      ...analise,
      resumo,
      recomendacaoPratica: recomendacao,
      vereditoBadge: null,
      notaCustoBeneficio: null,
      economiaEstimada: null,
      precoAlvoSugeridoBrl: null,
      acaoSugerida: "nenhuma",
      opcoes: [],
      pontosDeAtencao: [...pontosDosSinais(custos.sinais), ...complementares].slice(0, 8),
    },
    aviso: trocou ? "Alguns trechos da IA citavam valores que o DuoPlanner não calculou e foram trocados pelos números do app." : null,
  };
}

export async function consultarAdvisor(
  entrada: { estrategia: EstrategiaId; texto: string },
  sessao: Sessao,
  deps: DependenciasAdvisor = {}
): Promise<ResultadoAdvisor> {
  const hoje = deps.hojeIso ?? todayInSaoPaulo();
  const { dados, preferencias } = await (deps.carregar ?? carregarDoWorkspace)(sessao);
  const viagem = resumirContexto(dados, preferencias, hoje);
  const contexto = paraContextoUsado(viagem);

  // Falta o que analisar: pergunta, sem chamar a IA nem gastar cota.
  const pergunta = perguntaDeLacuna(entrada.estrategia, viagem, entrada.texto);
  if (pergunta) return { tipo: "pergunta", estrategia: entrada.estrategia, pergunta, contexto };

  const comPainel = ESTRATEGIAS_COM_PAINEL_DE_CUSTOS.includes(entrada.estrategia);
  const custos = comPainel ? viagem.custos : null;
  const local = (aviso: string): ResultadoAdvisor => ({
    tipo: "analise",
    estrategia: entrada.estrategia,
    origem: "local",
    analise: analiseLocal(entrada.estrategia, contexto, viagem.custos),
    custos,
    contexto,
    aviso,
  });

  if (!(deps.iaAtiva ?? (() => integracaoAtiva("ia")))()) {
    return local("A análise com IA não está ligada neste ambiente. Aqui vai a lista de conferência.");
  }
  const cota = await (deps.cota ?? ((s) => consumirCota(s.supabase, s.userId, "ia")))(sessao);
  if (!cota.permitido) return local(`${cota.mensagem} Enquanto isso, aqui vai a lista de conferência.`);

  try {
    const modelo = deps.modelo ?? modeloGemini();
    const bruto = await modelo.invoke(
      [
        new SystemMessage(promptDaEstrategia(entrada.estrategia)),
        new HumanMessage(mensagemParaOModelo(viagem, hoje, entrada.texto)),
      ],
      { signal: AbortSignal.timeout(PRAZO_ADVISOR_MS) }
    );
    const lida = esquemaDaEstrategia(entrada.estrategia).safeParse(bruto);
    if (!lida.success) {
      console.error("[nora-advisor] resposta fora do formato:", entrada.estrategia, lida.error.issues.map((i) => i.message).join("; "));
      return local("A IA devolveu uma resposta incompleta. Aqui vai a lista de conferência.");
    }
    if (comPainel) {
      const conferida = aplicarRegrasDeCustos(lida.data, viagem.custos);
      return { tipo: "analise", estrategia: entrada.estrategia, origem: "ia", analise: conferida.analise, custos, contexto, aviso: conferida.aviso };
    }
    return { tipo: "analise", estrategia: entrada.estrategia, origem: "ia", analise: lida.data, custos, contexto, aviso: null };
  } catch (erro) {
    if (foiPrazo(erro)) {
      return local(`A IA demorou mais de ${PRAZO_ADVISOR_MS / 1000} segundos. Aqui vai a lista de conferência; tente de novo em instantes.`);
    }
    console.error("[nora-advisor] IA indisponível:", erro);
    return local("A IA está indisponível agora. Aqui vai a lista de conferência.");
  }
}
