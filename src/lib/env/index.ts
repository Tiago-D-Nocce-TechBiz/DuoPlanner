import "server-only";
import {
  analisarAmbiente,
  ErroDeAmbiente,
  VARIAVEIS,
  type AmbienteServidor,
  type NomeIntegracao,
  type ResultadoAmbiente,
  type StatusIntegracao,
} from "./esquema";

/**
 * Ambiente do servidor, validado (ponto único de leitura de `process.env`).
 *
 * O `next.config.ts` (build) e o `instrumentation.ts` (cada instância)
 * recusam subir com valor malformado; aqui o resultado é reaproveitado
 * enquanto as variáveis não mudam (a chave é o conjunto de valores, então
 * testes com `vi.stubEnv` veem a mudança).
 */

export type { AmbienteServidor, NomeIntegracao, StatusIntegracao } from "./esquema";

let ultimo: { chave: string; resultado: ResultadoAmbiente } | null = null;

function resultadoAtual(): ResultadoAmbiente {
  const fonte: Record<string, string | undefined> = {};
  for (const nome of VARIAVEIS) fonte[nome] = process.env[nome];
  // NEXT_PUBLIC_* desconhecidas também entram: a análise procura chaves
  // secretas expostas ao navegador.
  for (const nome of Object.keys(process.env)) {
    if (nome.startsWith("NEXT_PUBLIC_")) fonte[nome] = process.env[nome];
  }
  const chave = JSON.stringify(fonte);
  if (ultimo?.chave !== chave) ultimo = { chave, resultado: analisarAmbiente(fonte) };
  return ultimo.resultado;
}

/** Ambiente tipado. Lança `ErroDeAmbiente` se a configuração for inválida. */
export function ambiente(): AmbienteServidor {
  const r = resultadoAtual();
  if (!r.ok) throw new ErroDeAmbiente(r.erros);
  return r.ambiente;
}

/** O que está ligado e o que está em modo degradado. */
export function integracoes(): Record<NomeIntegracao, StatusIntegracao> {
  const r = resultadoAtual();
  if (!r.ok) throw new ErroDeAmbiente(r.erros);
  return r.integracoes;
}

export function integracaoAtiva(nome: NomeIntegracao): boolean {
  return integracoes()[nome].ativa;
}
