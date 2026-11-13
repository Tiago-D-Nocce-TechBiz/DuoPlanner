import {
  aplicarEvento,
  criarLeitorDeLinhas,
  estadoInicial,
  type EstadoExperiencias,
  type EventoExperiencias,
} from "./experiencias-protocolo";

/**
 * Lado do navegador das "Experiências Ocultas": chama `POST
 * /api/experiencias`, lê o NDJSON conforme chega e mantém o estado da tela
 * num pequeno store (a tela assina com `useSyncExternalStore`). Fora do
 * React de propósito: o pedido começa no submit da busca, antes de a seção
 * existir, e é testado sem DOM (`experiencias-cliente.test.ts`).
 *
 * Nunca rejeita: sem rede, prazo estourado ou erro do servidor viram o
 * estado "erro" com mensagem em PT-BR. Sem dependências (nada de zod no
 * navegador).
 */

/**
 * Sem nenhum byte por este tempo, a conexão é dada como perdida. O servidor
 * desiste da IA em 8 s sem resposta e avisa: este prazo é só para a rede.
 */
export const PRAZO_SEM_DADOS_MS = 15_000;

export interface PedidoExperiencias {
  readonly id: number;
  estado(): EstadoExperiencias;
  assinar(aoMudar: () => void): () => void;
  cancelar(): void;
}

let ultimoId = 0;

export function pedirExperiencias(
  destino: string,
  dataViagem: string | null,
  { fazerFetch = fetch, prazoSemDadosMs = PRAZO_SEM_DADOS_MS }: { fazerFetch?: typeof fetch; prazoSemDadosMs?: number } = {}
): PedidoExperiencias {
  const controle = new AbortController();
  const ouvintes = new Set<() => void>();
  let estado = estadoInicial(destino.trim().slice(0, 80));

  const aplicar = (eventos: EventoExperiencias[]) => {
    const novo = eventos.reduce(aplicarEvento, estado);
    if (novo === estado) return;
    estado = novo;
    for (const ouvinte of ouvintes) ouvinte();
  };
  const falhar = (mensagem: string) => aplicar([{ tipo: "erro", mensagem }]);

  void (async () => {
    let relogio: ReturnType<typeof setTimeout> | undefined;
    let esgotou = false;
    const vigiar = () => {
      clearTimeout(relogio);
      relogio = setTimeout(() => {
        esgotou = true;
        controle.abort();
      }, prazoSemDadosMs);
    };
    try {
      vigiar();
      const resposta = await fazerFetch("/api/experiencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destino, dataViagem }),
        signal: controle.signal,
      });
      if (!resposta.ok || !resposta.body) {
        const corpo = (await resposta.json().catch(() => null)) as { error?: unknown } | null;
        falhar(typeof corpo?.error === "string" && corpo.error ? corpo.error : "Sugestões indisponíveis agora.");
        return;
      }
      const leitor = resposta.body.getReader();
      const decodificador = new TextDecoder();
      const linhas = criarLeitorDeLinhas();
      while (true) {
        vigiar();
        const { value, done } = await leitor.read();
        // Todas as linhas de um trecho numa atualização só (um render por trecho).
        aplicar(linhas(done ? decodificador.decode() : decodificador.decode(value, { stream: true }), done));
        if (done) break;
      }
      // Fechou sem `fim` nem `erro` (no-op se um dos dois já chegou).
      falhar("A conexão caiu antes do fim das sugestões.");
    } catch {
      // Cancelado (nova busca ou saiu da tela): ninguém mais olha este pedido.
      if (controle.signal.aborted && !esgotou) return;
      falhar(
        esgotou
          ? "A conexão ficou lenta demais e as sugestões não chegaram. Tente de novo."
          : "Sem conexão com o servidor agora."
      );
    } finally {
      clearTimeout(relogio);
    }
  })();

  return {
    id: ++ultimoId,
    estado: () => estado,
    assinar(aoMudar) {
      ouvintes.add(aoMudar);
      return () => {
        ouvintes.delete(aoMudar);
      };
    },
    cancelar: () => controle.abort(),
  };
}
