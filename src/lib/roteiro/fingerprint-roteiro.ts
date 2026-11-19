import { sha256HexDoTexto } from "@/lib/finance/sha256";
import { FORMATO_FINGERPRINT_ROTEIRO } from "./tipos";

/**
 * Impressão digital das atividades importadas, para reimportar a mesma
 * planilha (ou aceitar a mesma sugestão da Nora) sem duplicar:
 *
 *   "r1:" + SHA-256("r1|origem|destino|data|atividade")
 *
 * Tudo normalizado (sem acento, minúsculas, espaços únicos). Fica de fora o
 * que a pessoa costuma ajustar depois (horário, categoria, custo e
 * observações): corrigir isso na planilha e reimportar não cria cópia.
 * Trocar qualquer regra acima exige um novo prefixo (r2): impressões de
 * versões diferentes nunca se comparam.
 */
export { FORMATO_FINGERPRINT_ROTEIRO };

export function normalizarParaComparar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Linha da planilha: onde, quando e o quê. */
export function fingerprintDaLinha(l: { destino: string; data: string | null; atividade: string }): string {
  return `r1:${sha256HexDoTexto(["r1", "planilha", normalizarParaComparar(l.destino), l.data ?? "-", normalizarParaComparar(l.atividade)].join("|"))}`;
}

/** Sugestão da Nora: o lugar naquele destino (vale para qualquer dia). */
export function fingerprintDaSugestao(s: { destino: string; titulo: string }): string {
  return `r1:${sha256HexDoTexto(["r1", "nora", normalizarParaComparar(s.destino), normalizarParaComparar(s.titulo)].join("|"))}`;
}
