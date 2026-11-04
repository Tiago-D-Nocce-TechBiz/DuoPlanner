/**
 * Pix "Copia e Cola" — BR Code estático (padrão EMV® QRCPS-MPM do Banco
 * Central). Puro e testável; não depende de nenhum serviço externo.
 *
 * Estrutura (ID + tamanho com 2 dígitos + valor):
 *   00 Payload Format Indicator = "01"
 *   26 Merchant Account Information
 *        00 GUI = "br.gov.bcb.pix"
 *        01 chave Pix
 *        02 descrição (opcional)
 *   52 MCC = "0000"   53 moeda = "986" (BRL)   54 valor (opcional)
 *   58 país = "BR"    59 nome do recebedor (≤ 25)   60 cidade (≤ 15)
 *   62 dados adicionais → 05 txid ("***" quando não há)
 *   63 CRC16-CCITT-FALSE (poly 0x1021, início 0xFFFF) sobre tudo, inclusive "6304"
 *
 * O campo 01 (Point of Initiation) é omitido de propósito: é opcional, e o
 * valor "12" (uso único) é próprio do Pix dinâmico — alguns bancos recusam
 * "12" num código estático. O exemplo oficial do BCB também o omite.
 */

export type TipoChavePix = "cpf" | "cnpj" | "telefone" | "email" | "aleatoria";

export const TIPOS_CHAVE_PIX: readonly TipoChavePix[] = ["cpf", "cnpj", "telefone", "email", "aleatoria"];

export const ROTULOS_TIPO_CHAVE: Record<TipoChavePix, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  telefone: "Celular",
  email: "E-mail",
  aleatoria: "Chave aleatória",
};

export type ResultadoChave = { ok: true; chave: string } | { ok: false; erro: string };

function digitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, peso, i) => acc + Number(base[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(cnpj.slice(0, 12)) === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

/** Normaliza e valida a chave conforme o tipo (formato aceito pelo DICT). */
export function normalizarChavePix(tipo: TipoChavePix, bruta: string): ResultadoChave {
  const valor = bruta.trim();
  switch (tipo) {
    case "cpf": {
      const cpf = digitos(valor);
      return cpfValido(cpf) ? { ok: true, chave: cpf } : { ok: false, erro: "CPF inválido." };
    }
    case "cnpj": {
      const cnpj = digitos(valor);
      return cnpjValido(cnpj) ? { ok: true, chave: cnpj } : { ok: false, erro: "CNPJ inválido." };
    }
    case "telefone": {
      let numero = digitos(valor);
      if (numero.length === 13 && numero.startsWith("55")) numero = numero.slice(2);
      // DDD (2) + celular (9 dígitos, começando com 9).
      if (!/^[1-9]{2}9\d{8}$/.test(numero)) {
        return { ok: false, erro: "Celular inválido. Use DDD + número, ex.: (11) 98765-4321." };
      }
      return { ok: true, chave: `+55${numero}` };
    }
    case "email": {
      const email = valor.toLowerCase();
      if (email.length > 77 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return { ok: false, erro: "E-mail inválido para chave Pix." };
      }
      return { ok: true, chave: email };
    }
    case "aleatoria": {
      const evp = valor.toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(evp)) {
        return { ok: false, erro: "Chave aleatória inválida (formato: 8-4-4-4-12 caracteres)." };
      }
      return { ok: true, chave: evp };
    }
  }
}

/** Texto aceito no BR Code: ASCII, sem acentos, sem caracteres de controle. */
export function textoPix(texto: string, max: number): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,\-/@]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

function campo(id: string, valor: string): string {
  if (valor.length > 99) throw new Error(`Campo ${id} do BR Code excede 99 caracteres.`);
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

/** CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 dígitos hexadecimais maiúsculos. */
export function crc16Pix(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface DadosPix {
  /** Chave já normalizada (use normalizarChavePix). */
  chave: string;
  nomeRecebedor: string;
  cidade: string;
  /** Em reais; omitido = o pagador digita o valor. */
  valor?: number;
  /** Até 25 caracteres alfanuméricos; padrão "***" (sem identificador). */
  txid?: string;
  /** Mensagem curta para quem recebe (vai no campo 26.02, se couber). */
  descricao?: string;
}

/** Monta o Pix Copia e Cola. Lança se os dados não couberem no padrão. */
export function gerarPixCopiaECola(dados: DadosPix): string {
  const nome = textoPix(dados.nomeRecebedor, 25);
  const cidade = textoPix(dados.cidade, 15);
  if (!dados.chave || dados.chave.length > 77) throw new Error("Chave Pix inválida.");
  if (!nome) throw new Error("Informe o nome de quem recebe.");
  if (!cidade) throw new Error("Informe a cidade de quem recebe.");

  const gui = campo("00", "br.gov.bcb.pix");
  const chave = campo("01", dados.chave);
  let contaRecebedor = gui + chave;
  const descricao = dados.descricao ? textoPix(dados.descricao, 72) : "";
  if (descricao) {
    const comDescricao = contaRecebedor + campo("02", descricao.slice(0, 99 - contaRecebedor.length - 4));
    if (comDescricao.length <= 99) contaRecebedor = comDescricao;
  }

  let valor = "";
  if (dados.valor !== undefined) {
    if (!Number.isFinite(dados.valor) || dados.valor <= 0 || dados.valor > 9_999_999_999.99) {
      throw new Error("Valor do Pix inválido.");
    }
    valor = campo("54", dados.valor.toFixed(2));
  }

  const txidLimpo = (dados.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  const adicionais = campo("62", campo("05", txidLimpo || "***"));

  const semCrc =
    campo("00", "01") +
    campo("26", contaRecebedor) +
    campo("52", "0000") +
    campo("53", "986") +
    valor +
    campo("58", "BR") +
    campo("59", nome) +
    campo("60", cidade) +
    adicionais +
    "6304";
  return semCrc + crc16Pix(semCrc);
}

/** Confere o CRC de um Pix Copia e Cola (útil para testes e diagnósticos). */
export function crcConfere(payload: string): boolean {
  if (payload.length < 8 || payload.slice(-8, -4) !== "6304") return false;
  return crc16Pix(payload.slice(0, -4)) === payload.slice(-4).toUpperCase();
}
