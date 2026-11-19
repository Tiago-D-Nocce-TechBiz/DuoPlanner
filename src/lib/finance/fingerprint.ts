import { FORMATO_FINGERPRINT, VERSAO_FINGERPRINT } from "./fingerprint-formato";
import { toCents } from "./money";
import { sha256HexDoTexto } from "./sha256";

/**
 * `transaction_fingerprint`: impressão digital de uma compra importada da
 * fatura (puro e síncrono; roda no navegador e no Node).
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
 * O SHA-256 é o de `./sha256` (JavaScript, síncrono), com resultado idêntico
 * ao do Web Crypto: os fingerprints já gravados continuam batendo. Síncrono
 * para a fatura aparecer na hora (ver o comentário em `./sha256`) e para
 * funcionar também fora de contexto seguro.
 *
 * Trocar qualquer regra acima exige um novo prefixo (v2): fingerprints de
 * versões diferentes nunca se comparam.
 */

export { FORMATO_FINGERPRINT, VERSAO_FINGERPRINT };

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

export function calcularFingerprint(c: CompraParaFingerprint, ocorrencia: number): string {
  return `${VERSAO_FINGERPRINT}:${sha256HexDoTexto(entradaDoFingerprint(c, ocorrencia))}`;
}

/**
 * Fingerprints de um arquivo inteiro, na ordem das linhas (cada linha
 * idêntica recebe a próxima ocorrência). Numa fatura de 200 compras: 1 a 2 ms
 * na CPU de um computador, ~15 ms com a CPU 4x mais lenta (celular médio).
 */
export function fingerprintsDoLote(compras: readonly CompraParaFingerprint[]): string[] {
  const vistas = new Map<string, number>();
  return compras.map((c) => {
    const base = baseDoFingerprint(c);
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    // A mesma entrada de `entradaDoFingerprint(c, n)`, sem montar a base de novo.
    return `${VERSAO_FINGERPRINT}:${sha256HexDoTexto(`${base}|#${n}`)}`;
  });
}

/**
 * "Importar mesmo assim": a mesma compra com a próxima ocorrência que ainda
 * não está gravada nem reservada neste lote. Sem isso o índice único do
 * banco recusaria a linha.
 */
export function proximoFingerprintLivre(c: CompraParaFingerprint, ocupados: ReadonlySet<string>, limite = 1000): string {
  for (let n = 1; n <= limite; n++) {
    const candidato = calcularFingerprint(c, n);
    if (!ocupados.has(candidato)) return candidato;
  }
  throw new RangeError("Ocorrências demais para a mesma compra.");
}
