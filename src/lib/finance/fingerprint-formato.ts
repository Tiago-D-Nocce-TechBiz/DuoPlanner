/**
 * Formato do `transaction_fingerprint` ("v1:" + SHA-256 em 64 dígitos
 * hexadecimais), separado do cálculo (`./fingerprint`). Os modelos e a
 * validação da fila de sincronização usam só isto e rodam em todo o painel:
 * importando daqui, o SHA-256 fica no pacote do importador de fatura.
 */
export const VERSAO_FINGERPRINT = "v1";
export const FORMATO_FINGERPRINT = /^v1:[0-9a-f]{64}$/;
