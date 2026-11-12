import "server-only";
import { ambiente } from "@/lib/env";
import { cifrarNumero, decifrarNumero, type ContextoCifra } from "./cripto-documentos-nucleo";

/**
 * Cifra dos números de documentos com a chave DOCUMENTOS_CHAVE_CRIPTO
 * (base64 de 32 bytes; gere com
 * `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
 *
 * A chave só existe no servidor: nem o banco nem o navegador a conhecem, então
 * um vazamento do banco não revela os números. Sem a chave, a aplicação guarda
 * só os 4 últimos dígitos (fail-closed) e avisa o usuário. Uma chave
 * MALFORMADA não cai nesse modo em silêncio: @/lib/env recusa subir o servidor.
 * Para saber se está ligada: `integracaoAtiva("criptografiaDocumentos")`.
 */

/** null quando a chave não está configurada (não grava o número completo). */
export function cifrarNumeroDocumento(numero: string, contexto: ContextoCifra): string | null {
  const chave = ambiente().chaveDocumentos;
  return chave ? cifrarNumero(numero, chave, contexto) : null;
}

export function decifrarNumeroDocumento(cifrado: string, contexto: ContextoCifra): string | null {
  const chave = ambiente().chaveDocumentos;
  return chave ? decifrarNumero(cifrado, chave, contexto) : null;
}
