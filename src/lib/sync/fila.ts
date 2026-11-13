import type { Recurso } from "./modelos";

/**
 * Fila de operações da sincronização (pura, testável).
 *
 * Toda alteração feita no app vira uma operação persistida no aparelho e
 * enviada em lote ao servidor. Enquanto não chega lá (offline, banco sem a
 * migration), a tela mostra o snapshot do servidor + a fila aplicada por cima.
 *
 * Operações ainda NÃO enviadas do mesmo registro são combinadas: digitar o
 * título de uma atividade gera uma atualização, não uma por tecla; criar e
 * apagar antes de sincronizar não manda nada.
 */

export type Operacao =
  | { opId: string; recurso: Recurso; tipo: "criar"; registro: { id: string } & Record<string, unknown> }
  | { opId: string; recurso: Recurso; tipo: "atualizar"; id: string; campos: Record<string, unknown> }
  | { opId: string; recurso: Recurso; tipo: "remover"; id: string };

export function idDaOperacao(op: Operacao): string {
  return op.tipo === "criar" ? op.registro.id : op.id;
}

const mesmoAlvo = (a: Operacao, recurso: Recurso, id: string) => a.recurso === recurso && idDaOperacao(a) === id;

/** Campos que não mudam depois de criado (o banco também os congela). */
const IMUTAVEIS = new Set(["id", "userId", "workspaceId", "tipo", "origem", "criadoEm", "diaId", "transactionFingerprint"]);

function semImutaveis(registro: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(registro).filter(([campo]) => !IMUTAVEIS.has(campo)));
}

/**
 * Acrescenta `nova` à fila, combinando com as operações pendentes (fora de
 * `emVoo`) do mesmo registro. `existeNoServidor` diz se o registro já está
 * gravado lá (para decidir se um "remover" ainda precisa ser enviado).
 */
export function enfileirar(
  fila: readonly Operacao[],
  nova: Operacao,
  emVoo: ReadonlySet<string>,
  existeNoServidor: (recurso: Recurso, id: string) => boolean
): Operacao[] {
  const id = idDaOperacao(nova);
  const resultado = [...fila];

  if (nova.tipo === "atualizar") {
    for (let i = resultado.length - 1; i >= 0; i--) {
      const op = resultado[i];
      if (!mesmoAlvo(op, nova.recurso, id)) continue;
      if (emVoo.has(op.opId)) break; // a última já foi enviada: nova vai ao fim
      if (op.tipo === "remover") return resultado; // vai ser apagado: ignora
      if (op.tipo === "criar") {
        resultado[i] = { ...op, registro: { ...op.registro, ...nova.campos, id } };
      } else {
        resultado[i] = { ...op, campos: { ...op.campos, ...nova.campos } };
      }
      return resultado;
    }
    resultado.push(nova);
    return resultado;
  }

  if (nova.tipo === "remover") {
    let criacaoDescartada = false;
    let algumEmVoo = false;
    const filtrada = resultado.filter((op) => {
      if (!mesmoAlvo(op, nova.recurso, id)) return true;
      if (emVoo.has(op.opId)) {
        algumEmVoo = true;
        return true;
      }
      if (op.tipo === "criar") criacaoDescartada = true;
      return false;
    });
    const nuncaChegouAoServidor = criacaoDescartada && !algumEmVoo && !existeNoServidor(nova.recurso, id);
    if (!nuncaChegouAoServidor) filtrada.push(nova);
    return filtrada;
  }

  // criar: desfazer uma remoção que ainda não foi enviada.
  for (let i = resultado.length - 1; i >= 0; i--) {
    const op = resultado[i];
    if (!mesmoAlvo(op, nova.recurso, id) || emVoo.has(op.opId)) continue;
    if (op.tipo === "remover") {
      resultado.splice(i, 1);
      if (existeNoServidor(nova.recurso, id)) {
        resultado.push({ opId: nova.opId, recurso: nova.recurso, tipo: "atualizar", id, campos: semImutaveis(nova.registro) });
        return resultado;
      }
      break;
    }
  }
  resultado.push(nova);
  return resultado;
}

/**
 * Resultado de cada operação sobre a versão anterior do registro. A mesma
 * operação (as da fila são imutáveis: combinar cria outra) sobre a mesma
 * base devolve o MESMO objeto: o registro que não mudou mantém a referência
 * de uma derivação para a outra, e as linhas memoizadas da tela não
 * redesenham. Sem isso, no modo local ou offline (tudo ainda na fila), cada
 * tecla recriava todos os registros pendentes.
 */
const derivados = new WeakMap<Operacao, { base: unknown; resultado: unknown }>();

function sobre<T>(op: Operacao, base: T | undefined, calcular: () => T): T {
  const guardado = derivados.get(op);
  if (guardado && guardado.base === base) return guardado.resultado as T;
  const resultado = calcular();
  derivados.set(op, { base, resultado });
  return resultado;
}

/**
 * Visão da tela: snapshot do servidor + fila aplicada em ordem. Registro sem
 * mudança desde a última derivação sai com a mesma referência.
 */
export function derivar<T extends { id: string }>(
  servidor: ReadonlyMap<string, T>,
  fila: readonly Operacao[],
  recurso: Recurso
): T[] {
  const mapa = new Map(servidor);
  for (const op of fila) {
    if (op.recurso !== recurso) continue;
    if (op.tipo === "criar") {
      const base = mapa.get(op.registro.id);
      mapa.set(op.registro.id, sobre(op, base, () => ({ ...(base ?? {}), ...op.registro }) as unknown as T));
    } else if (op.tipo === "atualizar") {
      const atual = mapa.get(op.id);
      if (atual) mapa.set(op.id, sobre(op, atual, () => ({ ...atual, ...op.campos }) as T));
    } else {
      mapa.delete(op.id);
    }
  }
  return [...mapa.values()];
}

/** Quantas alterações ainda não chegaram ao servidor. */
export function contarPendentes(fila: readonly Operacao[]): number {
  return fila.length;
}
