import { toCents } from "./money";

/**
 * `transaction_fingerprint`: impressão digital de uma compra importada da
 * fatura (puro; roda no navegador e no Node, via Web Crypto).
 *
 * Entrada canônica, versão 1:
 *
 *   v1|AAAA-MM-DD|DESCRIÇÃO ORIGINAL|centavos|MOEDA|atual/total|#n
 *
 *  - descrição exatamente como veio da fatura, em Unicode NFC, sem espaços
 *    sobrando e em MAIÚSCULAS ("Uber  *Trip" e "UBER *TRIP" são a mesma);
 *  - valor em centavos inteiros (`./money`): 23,45 e 23.450000001 empatam;
 *  - parcela "3/10" ou "-" para compra à vista: a parcela 3 e a 4 da mesma
 *    compra são lançamentos diferentes;
 *  - n = posição da linha entre as IDÊNTICAS do mesmo arquivo: duas corridas
 *    iguais no mesmo dia são duas compras, não uma duplicada.
 *
 * Gravado como "v1:" + SHA-256 em hexadecimal (64 caracteres): tamanho fixo
 * para o índice e sem repetir a descrição em claro. O banco garante a
 * unicidade por pessoa (índice único parcial em user_id + fingerprint).
 *
 * Trocar qualquer regra acima exige um novo prefixo (v2): fingerprints de
 * versões diferentes nunca se comparam.
 */

export const VERSAO_FINGERPRINT = "v1";
export const FORMATO_FINGERPRINT = /^v1:[0-9a-f]{64}$/;

export interface CompraParaFingerprint {
  /** Data do lançamento, AAAA-MM-DD. */
  dataIso: string;
  /** Descrição exatamente como veio da fatura. */
  descricaoOriginal: string;
  /** Valor cobrado nesta fatura, em reais. */
  valor: number;
  moeda: string;
  /** null = compra à vista. */
  parcela: { atual: number; total: number } | null;
}

export function normalizarDescricaoFatura(descricao: string): string {
  return descricao.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
}

/** Tudo menos a ocorrência: linhas com a mesma base são idênticas. */
export function baseDoFingerprint(c: CompraParaFingerprint): string {
  return [
    VERSAO_FINGERPRINT,
    c.dataIso,
    normalizarDescricaoFatura(c.descricaoOriginal),
    String(toCents(c.valor)),
    c.moeda.trim().toUpperCase(),
    c.parcela ? `${c.parcela.atual}/${c.parcela.total}` : "-",
  ].join("|");
}

export function entradaDoFingerprint(c: CompraParaFingerprint, ocorrencia: number): string {
  if (!Number.isSafeInteger(ocorrencia) || ocorrencia < 1) throw new RangeError(`Ocorrência inválida: ${ocorrencia}.`);
  return `${baseDoFingerprint(c)}|#${ocorrencia}`;
}

/** Web Crypto só existe em contexto seguro (https ou localhost). */
export function fingerprintDisponivel(): boolean {
  return typeof globalThis.crypto?.subtle?.digest === "function";
}

async function sha256Hex(texto: string): Promise<string> {
  const resumo = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function calcularFingerprint(c: CompraParaFingerprint, ocorrencia: number): Promise<string> {
  return `${VERSAO_FINGERPRINT}:${await sha256Hex(entradaDoFingerprint(c, ocorrencia))}`;
}

/**
 * Fingerprints de um arquivo inteiro, na ordem das linhas (cada linha
 * idêntica recebe a próxima ocorrência). null quando o navegador não tem Web
 * Crypto: a importação segue só com a checagem por data e valor.
 */
export async function fingerprintsDoLote(compras: readonly CompraParaFingerprint[]): Promise<string[] | null> {
  if (!fingerprintDisponivel()) return null;
  const vistas = new Map<string, number>();
  const ocorrencias = compras.map((c) => {
    const base = baseDoFingerprint(c);
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return n;
  });
  return Promise.all(compras.map((c, i) => calcularFingerprint(c, ocorrencias[i])));
}

/**
 * "Importar mesmo assim": a mesma compra com a próxima ocorrência que ainda
 * não está gravada nem reservada neste lote. Sem isso o índice único do
 * banco recusaria a linha.
 */
export async function proximoFingerprintLivre(
  c: CompraParaFingerprint,
  ocupados: ReadonlySet<string>,
  limite = 1000
): Promise<string> {
  for (let n = 1; n <= limite; n++) {
    const candidato = await calcularFingerprint(c, n);
    if (!ocupados.has(candidato)) return candidato;
  }
  throw new RangeError("Ocorrências demais para a mesma compra.");
}
