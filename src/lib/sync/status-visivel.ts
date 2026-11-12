import type { StatusSync } from "./motor";

/**
 * O que o selo de sincronização do cabeçalho mostra (puro, testável).
 *
 * Ordem de prioridade: sem internet vence tudo; depois o carregamento, o
 * modo local (banco sem a migration) e o servidor que não responde (para
 * quem usa, é o mesmo que estar offline: está tudo guardado no aparelho).
 * "Salvando…" só aparece se a fila ficar pendente por um tempo (a tela não
 * pisca a cada toque, porque o envio leva milissegundos).
 */

export type EstadoVisivel = "nuvem" | "salvando" | "offline" | "local" | "conectando";

export const ROTULO_ESTADO: Record<EstadoVisivel, string> = {
  nuvem: "Sincronizado na nuvem",
  salvando: "Salvando alterações…",
  offline: "Offline (Salvo neste aparelho)",
  local: "Salvo neste aparelho (modo local)",
  conectando: "Conectando…",
};

/** Texto curto para telas estreitas (nos demais estados, só o ícone). */
export const ROTULO_CURTO: Partial<Record<EstadoVisivel, string>> = { offline: "Offline" };

export function estadoVisivel(
  s: Pick<StatusSync, "modo" | "pendentes" | "semServidor">,
  online: boolean,
  pendenteHaTempo: boolean
): EstadoVisivel | null {
  if (s.modo === "inativo") return null;
  if (!online) return "offline";
  if (s.modo === "carregando") return "conectando";
  if (s.modo === "local") return "local";
  if (s.semServidor) return "offline";
  if (s.pendentes > 0 && pendenteHaTempo) return "salvando";
  return "nuvem";
}

const alteracoes = (n: number) => (n === 1 ? "1 alteração" : `${n} alterações`);

/** Explicação completa (dica e nome acessível do selo). */
export function detalheDoEstado(estado: EstadoVisivel, s: Pick<StatusSync, "pendentes" | "semServidor">, online: boolean): string {
  const guardadas = s.pendentes > 0 ? ` ${alteracoes(s.pendentes)} guardada(s) aqui.` : "";
  switch (estado) {
    case "nuvem":
      return "Tudo salvo na nuvem e visível para vocês dois.";
    case "salvando":
      return `Enviando ${alteracoes(s.pendentes)} para a nuvem.`;
    case "offline":
      return online
        ? `O servidor não respondeu: o que você fizer fica neste aparelho e sobe sozinho.${guardadas} Toque para tentar agora.`
        : `Sem internet: o que você fizer fica neste aparelho e sobe quando a conexão voltar.${guardadas}`;
    case "local":
      return `A sincronização entre vocês ainda não foi ativada neste servidor. Nada se perde: fica neste aparelho.${guardadas}`;
    case "conectando":
      return "Buscando a versão mais recente na nuvem.";
  }
}
