import "server-only";
import {
  cifrarNumero,
  decifrarNumero,
  lerChaveCifra,
  type ContextoCifra,
} from "./cripto-documentos-nucleo";

/**
 * Cifra dos números de documentos com a chave DOCUMENTOS_CHAVE_CRIPTO
 * (base64 de 32 bytes; gere com
 * `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
 *
 * A chave só existe no servidor: nem o banco nem o navegador a conhecem, então
 * um vazamento do banco não revela os números. Sem a chave configurada, a
 * aplicação guarda só os 4 últimos dígitos (fail-closed) e avisa o usuário.
 */

export function criptografiaConfigurada(): boolean {
  return lerChaveCifra(process.env.DOCUMENTOS_CHAVE_CRIPTO) !== null;
}

/** null quando a chave não está configurada (não grava o número completo). */
export function cifrarNumeroDocumento(numero: string, contexto: ContextoCifra): string | null {
  const chave = lerChaveCifra(process.env.DOCUMENTOS_CHAVE_CRIPTO);
  return chave ? cifrarNumero(numero, chave, contexto) : null;
}

export function decifrarNumeroDocumento(cifrado: string, contexto: ContextoCifra): string | null {
  const chave = lerChaveCifra(process.env.DOCUMENTOS_CHAVE_CRIPTO);
  return chave ? decifrarNumero(cifrado, chave, contexto) : null;
}
