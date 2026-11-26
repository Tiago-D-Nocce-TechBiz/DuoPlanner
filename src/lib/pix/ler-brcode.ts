import { crc16Pix } from "./brcode";

/**
 * Decodificador estrito do Pix Copia e Cola (BR Code estático do DuoPlanner).
 *
 * Existe para PROVAR que o que `gerarPixCopiaECola` produz é um BR Code bem
 * formado e para diagnóstico: lê o TLV inteiro, confere o CRC16 e os limites
 * do padrão (campo 26 com até 99 caracteres, chave com até 77, nome com até 25,
 * cidade com até 15, valor com 2 casas, só ASCII imprimível) e devolve os
 * campos. Não é usado na tela: fica fora do pacote do navegador.
 */

export interface BrCodeLido {
  chave: string;
  nomeRecebedor: string;
  cidade: string;
  /** null = sem valor (a pessoa digita no banco). */
  valorCentavos: number | null;
  /** "***" quando não há identificador. */
  txid: string;
  descricao: string | null;
}

export type ResultadoBrCode = { ok: true; dados: BrCodeLido } | { ok: false; erro: string };

type Campo = { id: string; valor: string };

/** Lê uma sequência de campos (ID de 2 dígitos + tamanho de 2 dígitos + valor), consumindo o texto inteiro. */
function lerCampos(texto: string): Campo[] | string {
  const campos: Campo[] = [];
  let i = 0;
  while (i < texto.length) {
    if (i + 4 > texto.length) return "campo cortado no fim do código";
    const id = texto.slice(i, i + 2);
    const tamanhoTexto = texto.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(tamanhoTexto)) return `cabeçalho de campo inválido em ${i}`;
    const tamanho = Number(tamanhoTexto);
    if (i + 4 + tamanho > texto.length) return `campo ${id} maior que o restante do código`;
    campos.push({ id, valor: texto.slice(i + 4, i + 4 + tamanho) });
    i += 4 + tamanho;
  }
  return campos;
}

function unicos(campos: Campo[]): Map<string, string> | string {
  const mapa = new Map<string, string>();
  for (const c of campos) {
    if (mapa.has(c.id)) return `campo ${c.id} repetido`;
    mapa.set(c.id, c.valor);
  }
  return mapa;
}

const falha = (erro: string): ResultadoBrCode => ({ ok: false, erro });

export function lerBrCode(payload: string): ResultadoBrCode {
  if (!/^[\x20-\x7e]+$/.test(payload)) return falha("só ASCII imprimível é permitido");
  if (payload.length > 512) return falha("código longo demais");
  if (payload.length < 8 || payload.slice(-8, -4) !== "6304") return falha("o CRC (campo 63) precisa ser o último");
  if (crc16Pix(payload.slice(0, -4)) !== payload.slice(-4)) return falha("CRC inválido");

  const lidos = lerCampos(payload);
  if (typeof lidos === "string") return falha(lidos);
  if (lidos[0]?.id !== "00") return falha("o primeiro campo precisa ser o 00");
  if (lidos[lidos.length - 1]?.id !== "63") return falha("o último campo precisa ser o 63");
  const raiz = unicos(lidos);
  if (typeof raiz === "string") return falha(raiz);

  if (raiz.get("00") !== "01") return falha("formato do payload diferente de 01");
  if (raiz.get("52") !== "0000") return falha("MCC inesperado");
  if (raiz.get("53") !== "986") return falha("a moeda precisa ser BRL (986)");
  if (raiz.get("58") !== "BR") return falha("o país precisa ser BR");

  const nome = raiz.get("59");
  if (!nome || nome.length > 25) return falha("nome do recebedor ausente ou com mais de 25 caracteres");
  const cidade = raiz.get("60");
  if (!cidade || cidade.length > 15) return falha("cidade ausente ou com mais de 15 caracteres");

  const conta = raiz.get("26");
  if (!conta) return falha("campo 26 ausente");
  if (conta.length > 99) return falha("campo 26 com mais de 99 caracteres");
  const contaCampos = lerCampos(conta);
  if (typeof contaCampos === "string") return falha(`campo 26: ${contaCampos}`);
  const dentro = unicos(contaCampos);
  if (typeof dentro === "string") return falha(`campo 26: ${dentro}`);
  if (dentro.get("00") !== "br.gov.bcb.pix") return falha("o GUI do campo 26 precisa ser br.gov.bcb.pix");
  const chave = dentro.get("01");
  if (!chave || chave.length > 77) return falha("chave Pix ausente ou com mais de 77 caracteres");
  const descricao = dentro.get("02") ?? null;

  let valorCentavos: number | null = null;
  const valorTexto = raiz.get("54");
  if (valorTexto !== undefined) {
    if (!/^\d{1,10}\.\d{2}$/.test(valorTexto)) return falha("valor precisa ter o formato 0.00");
    const [inteiro, centavos] = valorTexto.split(".");
    valorCentavos = Number(inteiro) * 100 + Number(centavos);
    if (valorCentavos < 1) return falha("valor precisa ser maior que zero");
  }

  const adicionais = raiz.get("62");
  if (adicionais === undefined) return falha("campo 62 ausente");
  const adicionaisCampos = lerCampos(adicionais);
  if (typeof adicionaisCampos === "string") return falha(`campo 62: ${adicionaisCampos}`);
  const extras = unicos(adicionaisCampos);
  if (typeof extras === "string") return falha(`campo 62: ${extras}`);
  const txid = extras.get("05");
  if (!txid || txid.length > 25 || !(txid === "***" || /^[A-Za-z0-9]+$/.test(txid))) return falha("txid ausente, com mais de 25 caracteres ou não alfanumérico");

  return { ok: true, dados: { chave, nomeRecebedor: nome, cidade, valorCentavos, txid, descricao } };
}
