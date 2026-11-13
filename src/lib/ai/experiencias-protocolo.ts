/**
 * Protocolo entre a rota `/api/experiencias` e a tela das "Experiências
 * Ocultas": uma linha JSON por evento (NDJSON), na ordem
 *   inicio → (rascunho | experiencia) × n → fim | erro
 *
 * - `rascunho`: a sugestão que a IA está escrevendo agora, com o texto que
 *   já chegou (cresce a cada trecho do modelo). Não é validada: a tela só a
 *   mostra como "sendo escrita".
 * - `experiencia`: a sugestão completa e validada na posição `indice`.
 *   Substitui o rascunho da mesma posição. Um rascunho que nunca vira
 *   `experiencia` (saiu fora do formato) some no próximo rascunho ou no fim.
 *
 * Sem dependências de propósito: a tela importa daqui e não pode levar o zod
 * nem a LangChain para o navegador (a validação fica no servidor, em
 * `experiencias-em-fluxo.ts`).
 */

export interface LocalGem {
  nome: string;
  descricao: string;
  custo: "gratuito" | "baixo custo";
  custo_estimado: string;
  melhor_momento: string;
  dica_local: string;
}

/** Texto parcial de uma sugestão (só os campos que já começaram a chegar). */
export type RascunhoExperiencia = Partial<Record<keyof LocalGem, string>>;

export const QUANTIDADE_EXPERIENCIAS = 3;

/** Destino aceito pela rota: 2 a 80 letras, espaços e pontuação de nome de lugar. */
export const PADRAO_DESTINO = /^[\p{L}\p{M}\s'’.,()-]{2,80}$/u;

export const destinoAceito = (texto: string) => PADRAO_DESTINO.test(texto.trim());

export const CAMPOS_EXPERIENCIA = [
  "nome",
  "descricao",
  "custo",
  "custo_estimado",
  "melhor_momento",
  "dica_local",
] as const satisfies readonly (keyof LocalGem)[];

export type EventoExperiencias =
  | { tipo: "inicio"; destino: string; contexto: string[] }
  | { tipo: "rascunho"; indice: number; experiencia: RascunhoExperiencia }
  | { tipo: "experiencia"; indice: number; experiencia: LocalGem }
  | { tipo: "fim" }
  | { tipo: "erro"; mensagem: string };

export const linhaDoEvento = (evento: EventoExperiencias) => `${JSON.stringify(evento)}\n`;

/* ------------------------------ estado na tela ------------------------------ */

export interface EstadoExperiencias {
  /** conectando → escrevendo → pronto | erro (os dois últimos são finais). */
  fase: "conectando" | "escrevendo" | "pronto" | "erro";
  destino: string;
  contexto: string[];
  /** Sugestões validadas, em ordem de posição. */
  prontas: { indice: number; experiencia: LocalGem }[];
  /** O card que a IA está escrevendo agora. */
  rascunho: { indice: number; experiencia: RascunhoExperiencia } | null;
  erro: string | null;
}

export function estadoInicial(destino: string): EstadoExperiencias {
  return { fase: "conectando", destino, contexto: [], prontas: [], rascunho: null, erro: null };
}

const posicaoValida = (indice: unknown): indice is number =>
  Number.isInteger(indice) && (indice as number) >= 0 && (indice as number) < QUANTIDADE_EXPERIENCIAS;

/**
 * Aplica um evento do fluxo ao estado da tela. Defensivo (a linha veio da
 * rede): evento fora do formato, fora de ordem ou depois do fim é ignorado.
 */
export function aplicarEvento(estado: EstadoExperiencias, evento: EventoExperiencias): EstadoExperiencias {
  if (estado.fase === "pronto" || estado.fase === "erro") return estado;
  switch (evento.tipo) {
    case "inicio":
      return {
        ...estado,
        fase: "escrevendo",
        destino: typeof evento.destino === "string" && evento.destino ? evento.destino : estado.destino,
        contexto: Array.isArray(evento.contexto) ? evento.contexto.filter((c) => typeof c === "string") : [],
      };
    case "rascunho": {
      if (!posicaoValida(evento.indice) || typeof evento.experiencia !== "object" || evento.experiencia === null) return estado;
      // Rascunho de uma posição já fechada chegou atrasado: descartado.
      if (estado.prontas.some((p) => p.indice >= evento.indice)) return estado;
      return { ...estado, fase: "escrevendo", rascunho: { indice: evento.indice, experiencia: evento.experiencia } };
    }
    case "experiencia": {
      if (!posicaoValida(evento.indice) || typeof evento.experiencia !== "object" || evento.experiencia === null) return estado;
      if (estado.prontas.some((p) => p.indice === evento.indice)) return estado;
      const prontas = [...estado.prontas, { indice: evento.indice, experiencia: evento.experiencia }].sort(
        (a, b) => a.indice - b.indice
      );
      const rascunho = estado.rascunho && estado.rascunho.indice > evento.indice ? estado.rascunho : null;
      return { ...estado, fase: "escrevendo", prontas, rascunho };
    }
    case "fim":
      return { ...estado, fase: "pronto", rascunho: null };
    case "erro":
      return {
        ...estado,
        fase: "erro",
        rascunho: null,
        erro: typeof evento.mensagem === "string" && evento.mensagem ? evento.mensagem : "Sugestões indisponíveis agora.",
      };
    default:
      return estado;
  }
}

/**
 * Separa as linhas completas de um texto que chega em pedaços arbitrários
 * (uma linha pode vir partida entre dois trechos). Linha corrompida é
 * ignorada: o fim ou o erro ainda chegam.
 */
export function criarLeitorDeLinhas() {
  let resto = "";
  return function linhas(trecho: string, terminou = false): EventoExperiencias[] {
    resto += trecho;
    const partes = resto.split("\n");
    resto = terminou ? "" : (partes.pop() ?? "");
    const eventos: EventoExperiencias[] = [];
    for (const parte of partes) {
      if (!parte.trim()) continue;
      try {
        eventos.push(JSON.parse(parte) as EventoExperiencias);
      } catch {
        // ignorada
      }
    }
    return eventos;
  };
}
