import { saveSearch, type SearchKind } from "./searches";

type DadosBusca = Parameters<typeof saveSearch>[0]["dados"];

/**
 * Registra a busca no histórico sem esperar nem incomodar (navegador): quem
 * busca não depende disso. Sem sessão, sem rede ou com o banco fora, só não
 * grava; nunca vira "Uncaught (in promise)" no console.
 */
export function registrarBusca(tipo: SearchKind, dados: DadosBusca): void {
  saveSearch({ tipo, dados }).catch(() => undefined);
}
