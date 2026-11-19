import { lerCsv } from "./csv";
import type { Celula } from "./planilha";
import { ABA_DE_INSTRUCOES, ABA_DO_ROTEIRO } from "./template-generator";
import { LIMITES_ROTEIRO } from "./tipos";

/**
 * Lê o arquivo que a pessoa soltou (.xlsx ou .csv) e devolve a matriz de
 * células para `interpretarPlanilha`. O `xlsx` só carrega aqui, por
 * `import()` dinâmico e só para .xlsx: o .csv usa o leitor próprio.
 *
 * O arquivo é lido NO NAVEGADOR e nunca vai ao servidor; só as linhas já
 * interpretadas seguem (e apenas se a pessoa pedir a curadoria da Nora).
 */

export type ResultadoLeitura = { ok: true; matriz: Celula[][]; formato: "xlsx" | "csv" } | { ok: false; mensagem: string };

/** Um .xlsx é um zip: começa com "PK\x03\x04". */
export function pareceXlsx(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** UTF-8; se o arquivo vier em Windows-1252 (Excel brasileiro), decodifica como tal. */
export function decodificarTexto(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

export async function lerArquivoDoRoteiro(arquivo: File): Promise<ResultadoLeitura> {
  const nome = arquivo.name.toLowerCase();
  const ehXlsx = nome.endsWith(".xlsx");
  const ehCsv = nome.endsWith(".csv");
  if (!ehXlsx && !ehCsv) return { ok: false, mensagem: "Use um arquivo .xlsx ou .csv (baixe o modelo para ver o formato)." };
  if (arquivo.size === 0) return { ok: false, mensagem: "O arquivo está vazio." };
  if (arquivo.size > LIMITES_ROTEIRO.arquivoBytes) {
    return { ok: false, mensagem: `O arquivo passa de ${LIMITES_ROTEIRO.arquivoBytes / 1024 / 1024} MB. Envie só a aba do roteiro.` };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await arquivo.arrayBuffer());
  } catch {
    return { ok: false, mensagem: "Não consegui abrir o arquivo. Tente de novo." };
  }

  if (ehCsv) {
    if (pareceXlsx(bytes)) return { ok: false, mensagem: "Este arquivo é uma planilha do Excel com extensão .csv. Salve como .xlsx ou como CSV de verdade." };
    return { ok: true, formato: "csv", matriz: lerCsv(decodificarTexto(bytes)) };
  }

  if (!pareceXlsx(bytes)) return { ok: false, mensagem: "Este arquivo não é uma planilha .xlsx válida." };
  try {
    const XLSX = await import("xlsx");
    const livro = XLSX.read(bytes, {
      type: "array",
      // Só texto e número: sem fórmulas, estilos, HTML nem macros; e um teto de linhas lidas.
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
      sheetRows: LIMITES_ROTEIRO.linhas + 25,
    });
    const aba =
      livro.SheetNames.find((n) => n === ABA_DO_ROTEIRO) ?? livro.SheetNames.find((n) => n !== ABA_DE_INSTRUCOES) ?? livro.SheetNames[0];
    const folha = aba ? livro.Sheets[aba] : undefined;
    if (!folha) return { ok: false, mensagem: "A planilha não tem nenhuma aba com dados." };
    // `range: 0` mantém o número da linha da planilha (a linha 1 é o índice 0).
    const matriz = XLSX.utils.sheet_to_json<Celula[]>(folha, { header: 1, raw: true, defval: null, blankrows: true, range: 0 });
    return { ok: true, formato: "xlsx", matriz };
  } catch {
    return { ok: false, mensagem: "Não consegui ler a planilha. Confira se o arquivo não está corrompido ou protegido por senha." };
  }
}
