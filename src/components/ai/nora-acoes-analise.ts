import { iataDaCidade } from "@/lib/concierge";
import type { AnaliseNora, ContextoUsado, Estrategia } from "@/lib/ai/nora-strategies";
import type { AlertaPreco } from "@/lib/sync/modelos";

/**
 * O que os botões do card de análise da Nora criam no DuoPlanner, montado
 * como dado puro (sem tocar no motor de sincronização): quem grava é o card.
 * Mesmas regras de tamanho e data da tela de roteiro e da de alertas.
 */

const TITULO_MAXIMO = 120;
const NOTA_MAXIMA = 500;

function encurtar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

/** A dica como atividade do roteiro: título curto + a recomendação e os alertas mais graves. */
export function dicaParaRoteiro(estrategia: Estrategia, analise: AnaliseNora, destino: string | null): { titulo: string; nota: string } {
  const titulo = encurtar(`Dica da Nora: ${estrategia.label}${destino ? ` (${destino})` : ""}`, TITULO_MAXIMO);
  const graves = analise.pontosDeAtencao
    .filter((p) => p.gravidade !== "info")
    .slice(0, 2)
    .map((p) => p.titulo);
  const nota = encurtar([analise.recomendacaoPratica, ...(graves.length > 0 ? [`Atenção: ${graves.join("; ")}.`] : [])].join(" "), NOTA_MAXIMA);
  return { titulo, nota };
}

export type ResultadoAlerta = { ok: true; alerta: AlertaPreco } | { ok: false; motivo: string };

/**
 * Alerta de preço de voo com o destino e as datas da viagem e o preço-alvo
 * que a análise sugeriu (se houver). Sem destino ou com a ida já passada,
 * explica o que falta em vez de criar um alerta inútil.
 */
export function alertaDaAnalise(args: {
  contexto: ContextoUsado;
  analise: AnaliseNora;
  userId: string;
  workspaceId: string | null;
  hojeIso: string;
  agoraIso: string;
  id: string;
}): ResultadoAlerta {
  const { contexto, analise } = args;
  const destino = contexto.destino?.trim().slice(0, 80) ?? "";
  if (destino.length < 2) {
    return { ok: false, motivo: "Ainda não sei o destino. Faça uma busca de passagens ou crie o alerta pela tela de Alertas de Preço." };
  }
  if (!contexto.ida || contexto.ida < args.hojeIso) {
    return { ok: false, motivo: "Falta uma data de ida futura. Informe as datas na busca de passagens ou crie o alerta pela tela de Alertas de Preço." };
  }
  const origem = contexto.origem?.trim().slice(0, 80) ?? "";
  const alvo = analise.precoAlvoSugeridoBrl;
  return {
    ok: true,
    alerta: {
      id: args.id,
      userId: args.userId,
      workspaceId: args.workspaceId,
      tipo: "voo",
      origem,
      origemIata: origem ? (iataDaCidade(origem) ?? null) : null,
      destino,
      destinoIata: iataDaCidade(destino) ?? null,
      ida: contexto.ida,
      volta: contexto.volta && contexto.volta >= contexto.ida ? contexto.volta : null,
      adultos: Math.min(9, Math.max(1, contexto.adultos ?? 2)),
      precoAlvo: alvo !== null && alvo > 0 && alvo <= 1_000_000 ? alvo : null,
      ativo: true,
      ultimoPreco: null,
      ultimoLink: null,
      ultimaVerificacaoEm: null,
      ultimoDisparoEm: null,
      atualizadoEm: args.agoraIso,
      atualizadoPor: args.userId,
    },
  };
}
