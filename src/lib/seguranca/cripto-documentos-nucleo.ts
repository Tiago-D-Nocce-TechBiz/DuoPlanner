import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Núcleo da cifra dos números de documentos (passaporte, RG, CNH...).
 *
 * AES-256-GCM com IV aleatório de 12 bytes e tag de 16 bytes. O dado
 * autenticado (AAD) é "<id do documento>:<id do dono>": um texto cifrado
 * copiado para outra linha ou outro usuário NÃO decifra.
 *
 * Formato salvo: "v1:<iv>:<tag>:<cifra>" (base64url). O prefixo de versão
 * permite trocar o algoritmo/chave no futuro sem migração às cegas.
 *
 * Puro (recebe a chave): testável. Use pelo wrapper `cripto-documentos.ts`,
 * que lê a chave do ambiente e é `server-only` — nunca no navegador.
 */

export const VERSAO_CIFRA = "v1";
const ALGORITMO = "aes-256-gcm";

export interface ContextoCifra {
  documentoId: string;
  userId: string;
}

/** Lê a chave (base64 de 32 bytes). Chave ausente ou curta → null. */
export function lerChaveCifra(base64: string | undefined | null): Buffer | null {
  if (!base64) return null;
  try {
    const chave = Buffer.from(base64.trim(), "base64");
    return chave.length === 32 ? chave : null;
  } catch {
    return null;
  }
}

function aad(contexto: ContextoCifra): Buffer {
  return Buffer.from(`${contexto.documentoId}:${contexto.userId}`, "utf8");
}

export function cifrarNumero(numero: string, chave: Buffer, contexto: ContextoCifra): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv(ALGORITMO, chave, iv);
  cifra.setAAD(aad(contexto));
  const texto = Buffer.concat([cifra.update(numero, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return [VERSAO_CIFRA, iv.toString("base64url"), tag.toString("base64url"), texto.toString("base64url")].join(":");
}

/** Devolve o número ou null (formato, chave ou contexto errados). */
export function decifrarNumero(cifrado: string, chave: Buffer, contexto: ContextoCifra): string | null {
  const partes = cifrado.split(":");
  if (partes.length !== 4 || partes[0] !== VERSAO_CIFRA) return null;
  try {
    const [, iv, tag, texto] = partes;
    const decifra = createDecipheriv(ALGORITMO, chave, Buffer.from(iv, "base64url"));
    decifra.setAAD(aad(contexto));
    decifra.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decifra.update(Buffer.from(texto, "base64url")), decifra.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// A máscara (4 finais) é pura e também roda no navegador: fica em
// `@/lib/documentos/modelo`, sem dependência de `node:crypto`. Import
// relativo: este módulo é carregado pelo next.config.ts (via @/lib/env/esquema).
export { finalDoNumero, mascararNumero } from "../documentos/modelo";
