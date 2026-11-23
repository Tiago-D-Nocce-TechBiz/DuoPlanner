/**
 * Importação de fatura de cartão ou extrato de conta (CSV, TXT ou texto
 * colado) para o DuoFinance.
 *
 * Puro e determinístico: "hoje" chega por parâmetro, então os testes não
 * dependem do relógio. Nada aqui grava dados; a página mostra o resultado
 * numa triagem e só salva o que o usuário confirmar.
 *
 * Regras:
 * - Valor: o último "." ou "," é o separador decimal. Com exatamente 3
 *   dígitos depois dele, é separador de milhar ("1.234" = 1234; "25.90" =
 *   25,90; "1.234,56" = 1234,56).
 * - Sinal: na fatura de cartão as compras são positivas e pagamentos ou
 *   estornos, negativos; no extrato de conta as saídas são negativas. O
 *   formato é deduzido pelos próprios lançamentos.
 * - Texto livre só aceita valor com centavos ou "R$": "Agência 1234" não
 *   vira um gasto de R$ 1.234,00.
 * - Toda linha não aproveitada volta em `ignoradas`, com o motivo.
 */

import { isoFromParts } from "@/lib/dates";
import { normalizarTexto, soAscii } from "./classificar";
import { roundMoney } from "./money";

export type FormatoExtrato = "cartao" | "conta" | "texto";

export interface LancamentoImportado {
  /** Número da linha no texto original (começa em 1). */
  linha: number;
  /** Data do lançamento, AAAA-MM-DD. */
  dataIso: string;
  titulo: string;
  /** Valor do gasto, sempre positivo. */
  valor: number;
  /** Categoria informada pelo banco, quando o arquivo traz essa coluna. */
  categoriaBanco?: string;
}

export interface LinhaIgnorada {
  linha: number;
  texto: string;
  motivo: string;
}

export interface ResultadoImportacao {
  itens: LancamentoImportado[];
  ignoradas: LinhaIgnorada[];
  formato: FormatoExtrato;
}

const LETRA = /[A-Za-zÀ-ÖØ-öø-ÿ]/;

function semAcentos(texto: string): string {
  return soAscii(texto) ? texto : texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* -------------------------------- Valores -------------------------------- */

const MOEDA_ESTRANGEIRA = /US\$|U\$|USD|EUR|€|£|GBP/i;

/** "1.234.567" com grupos de 3 dígitos depois do primeiro (1 a 3 dígitos). */
function gruposDeMilhar(texto: string, separador: string): boolean {
  const outro = separador === "." ? "," : ".";
  if (texto.includes(outro)) return false;
  const [primeiro, ...resto] = texto.split(separador);
  return /^[1-9]\d{0,2}$/.test(primeiro) && resto.every((g) => /^\d{3}$/.test(g));
}

/**
 * Converte um valor monetário em número. Aceita "R$", sinal "-" no início ou
 * no fim, parênteses contábeis e separadores brasileiros ou americanos.
 * Devolve null para texto que não é um valor (ou está em moeda estrangeira).
 */
export function parseValorMonetario(bruto: string): number | null {
  if (MOEDA_ESTRANGEIRA.test(bruto)) return null;
  let s = bruto
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/R\$|BRL/gi, "")
    .replace(/\s+/g, "");
  let negativo = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negativo = true;
    s = s.slice(0, -1);
  }
  if (!/^\d(?:[\d.,]*\d)?$/.test(s)) return null;

  let numero: number;
  const idx = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (idx < 0) {
    numero = Number(s);
  } else {
    const separador = s[idx];
    const antes = s.slice(0, idx);
    const depois = s.slice(idx + 1);
    if (depois.length === 3) {
      if (!gruposDeMilhar(s, separador)) return null;
      numero = Number(s.replace(/[.,]/g, ""));
    } else if (depois.length <= 2) {
      if (antes.includes(separador)) return null;
      const milhar = separador === "," ? "." : ",";
      if (antes.includes(milhar) && !gruposDeMilhar(antes, milhar)) return null;
      numero = Number(`${antes.replace(/[.,]/g, "")}.${depois}`);
    } else {
      return null;
    }
  }
  // Um trilhão ou mais não é valor de fatura (e sairia da faixa exata em centavos).
  if (!Number.isFinite(numero) || numero >= 1e12) return null;
  const arredondado = roundMoney(numero);
  if (arredondado === 0) return 0;
  return negativo ? -arredondado : arredondado;
}

/** Formato inequívoco de dinheiro: tem "R$", "reais" ou centavos. */
function temFormatoMonetario(token: string, sufixo = ""): boolean {
  return (
    /R\$/i.test(token) ||
    /\b(reais|real|brl)\b/i.test(sufixo) ||
    /[.,]\d{2}\s*\)?-?$/.test(token.trim())
  );
}

function ehValorEstrito(campo: string): boolean {
  return temFormatoMonetario(campo) && parseValorMonetario(campo) !== null;
}

/* --------------------------------- Datas --------------------------------- */

const MES =
  "(jan(?:eiro)?|fev(?:ereiro)?|feb|mar(?:co)?|abr(?:il)?|apr|mai(?:o)?|may|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|aug|set(?:embro)?|sep|out(?:ubro)?|oct|nov(?:embro)?|dez(?:embro)?|dec)";

const NUMERO_DO_MES: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11,
  dez: 12, dec: 12,
};

const RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ]\d{1,2}:\d{2}.*)?$/;
const RE_DIA_MES_ANO = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?: \d{1,2}:\d{2}(?::\d{2})?)?$/;
// Sem ano, só com "/" ou "-": "12.10" é mais provável ser um valor.
const RE_DIA_MES = /^(\d{1,2})[/-](\d{1,2})$/;
const RE_DIA_NOME_MES = new RegExp(
  `^(\\d{1,2})[ /.-]*(?:de )?${MES}\\.?(?:[ /.-]*(?:de )?(\\d{4}))?$`
);
// Data no começo de uma linha de texto livre ("05/10 Uber 23,45").
const RE_DATA_INICIAL = new RegExp(
  `^(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}(?:[/-](?:\\d{4}|\\d{2}))?|\\d{1,2}\\.\\d{1,2}\\.(?:\\d{4}|\\d{2})|\\d{1,2}[ /.-]*(?:de )?${MES}\\.?(?:[ /.-]*(?:de )?\\d{4})?)(?=[\\s;,|]|$)`,
  "i"
);

const montarIso = isoFromParts;

/** Lançamento sem ano já aconteceu: se cair no futuro, é do ano passado. */
function semAnoNoPassado(dia: number, mes: number, hojeIso: string): string | null {
  const ano = Number(hojeIso.slice(0, 4));
  const desteAno = montarIso(ano, mes, dia);
  if (desteAno && desteAno <= hojeIso) return desteAno;
  return montarIso(ano - 1, mes, dia);
}

/**
 * Data de um lançamento de fatura/extrato em AAAA-MM-DD. Aceita ISO,
 * dd/mm/aaaa, dd/mm/aa, dd/mm e "05 out". Sem ano, assume a ocorrência mais
 * recente que não esteja no futuro.
 */
export function parseDataLancamento(texto: string, hojeIso: string): string | null {
  // Memo: a mesma data aparece em várias compras e cada linha era lida duas
  // vezes (ao procurar o cabeçalho e ao ler a compra). O resultado só depende
  // do texto e de "hoje", então vale por "hoje"; tem teto de tamanho (entrada
  // vem de arquivo da pessoa) e só guarda textos curtos.
  if (texto.length > TAMANHO_MAXIMO_DO_MEMO) return lerDataLancamento(texto, hojeIso);
  if (hojeIso !== memoDatasHoje) {
    memoDatas.clear();
    memoDatasHoje = hojeIso;
  }
  const guardado = memoDatas.get(texto);
  if (guardado !== undefined) return guardado;
  const iso = lerDataLancamento(texto, hojeIso);
  if (memoDatas.size >= ENTRADAS_MAXIMAS_DO_MEMO) memoDatas.clear();
  memoDatas.set(texto, iso);
  return iso;
}
const ENTRADAS_MAXIMAS_DO_MEMO = 512;
const TAMANHO_MAXIMO_DO_MEMO = 40;
const memoDatas = new Map<string, string | null>();
let memoDatasHoje = "";
/** A leitura em si (sem memo); `parseDataLancamento` só a guarda. */
export function lerDataLancamento(texto: string, hojeIso: string): string | null {
  const s = semAcentos(texto).toLowerCase().trim().replace(/\s+/g, " ");
  let m = RE_ISO.exec(s);
  if (m) return montarIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = RE_DIA_MES_ANO.exec(s);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return montarIso(ano, Number(m[2]), Number(m[1]));
  }
  m = RE_DIA_MES.exec(s);
  if (m) return semAnoNoPassado(Number(m[1]), Number(m[2]), hojeIso);
  m = RE_DIA_NOME_MES.exec(s);
  if (m) {
    const mes = NUMERO_DO_MES[m[2].slice(0, 3)];
    return m[3]
      ? montarIso(Number(m[3]), mes, Number(m[1]))
      : semAnoNoPassado(Number(m[1]), mes, hojeIso);
  }
  return null;
}

/* ---------------------------------- CSV ---------------------------------- */

function contarForaDeAspas(linha: string, caractere: string): number {
  let total = 0;
  let aspas = false;
  for (const c of linha) {
    if (c === '"') aspas = !aspas;
    else if (c === caractere && !aspas) total++;
  }
  return total;
}

/** Há `caractere` fora de aspas? Sem aspas na linha, basta achar um. */
function temForaDeAspas(linha: string, caractere: string): boolean {
  if (!linha.includes(caractere)) return false;
  if (!linha.includes('"')) return true;
  return contarForaDeAspas(linha, caractere) > 0;
}

/** Bancos brasileiros usam ";" (a vírgula é decimal); depois tab; depois ",". */
function detectarSeparador(linha: string): string | null {
  for (const sep of [";", "\t", ","]) {
    if (temForaDeAspas(linha, sep)) return sep;
  }
  return null;
}

/** Divide uma linha CSV respeitando campos entre aspas ("" escapa aspas). */
function dividirCampos(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') {
        aspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"' && atual.trim() === "") {
      aspas = true;
      atual = "";
    } else if (c === sep) {
      campos.push(atual.trim());
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual.trim());
  return campos;
}

function pareceIdentificador(campo: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campo) ||
    (/^[\w-]{16,}$/.test(campo) && /\d/.test(campo))
  );
}

interface Cabecalho {
  colunas: number;
  data: number;
  valor: number;
  titulos: number[];
  categoria: number;
  temSaldo: boolean;
  /** Maior índice de coluna que a leitura usa (calculado uma vez, não por linha). */
  maiorIndice: number;
}

/** Reconhece a linha de títulos das colunas (date/title/amount, Data;Valor…). */
function detectarCabecalho(campos: string[], hojeIso: string): Cabecalho | null {
  if (campos.length < 2) return null;
  if (campos.some((c) => parseDataLancamento(c, hojeIso) || parseValorMonetario(c) !== null)) {
    return null;
  }
  let data = -1;
  let categoria = -1;
  let temSaldo = false;
  const titulos: number[] = [];
  const valores: { indice: number; nota: number }[] = [];

  campos.forEach((bruto, indice) => {
    const c = semAcentos(bruto).toLowerCase().trim();
    if (!c) return;
    if (/saldo|balance/.test(c)) {
      temSaldo = true;
      return;
    }
    if (/\b(date|data|dt)\b/.test(c)) {
      if (data < 0) data = indice;
      return;
    }
    if (/cotacao|limite/.test(c)) return;
    if (/amount|valor|value|quantia|montante|preco|price/.test(c)) {
      // Preferir a coluna em reais quando a fatura traz dólar e real.
      const emReais = /r\$|brl|reais|\breal\b/.test(c) ? 2 : 0;
      const estrangeira = /us\$|u\$|usd|dolar|eur|€|original/.test(c) ? 3 : 0;
      valores.push({ indice, nota: emReais - estrangeira });
      return;
    }
    if (/categor/.test(c)) {
      if (categoria < 0) categoria = indice;
      return;
    }
    if (/title|titulo|descri|estabelecimento|historico|lancamento|memo|detalhe|merchant/.test(c)) {
      titulos.push(indice);
    }
  });

  if (valores.length === 0 || (data < 0 && titulos.length === 0)) return null;
  const melhor = valores.reduce((a, b) => (b.nota > a.nota ? b : a));
  return {
    colunas: campos.length,
    data,
    valor: melhor.indice,
    titulos,
    categoria,
    temSaldo,
    maiorIndice: Math.max(data, melhor.indice, categoria, ...titulos),
  };
}

/* ------------------------------- Leitura ------------------------------- */

interface Candidato {
  linha: number;
  texto: string;
  dataIso: string;
  titulo: string;
  /** Com sinal, como veio no arquivo. */
  valor: number;
  categoriaBanco?: string;
  /** `normalizarTexto(titulo)`, calculado uma vez. */
  tituloNormalizado: string;
}

type Leitura =
  | { tipo: "ok"; dataIso: string; titulo: string; valor: number; categoriaBanco?: string }
  | { tipo: "erro"; motivo: string };

function limparTitulo(titulo: string): string {
  return titulo
    .replace(/\s+/g, " ")
    .replace(/^[\s.:=_|*\-–—,;]+|[\s.:=_|*\-–—,;]+$/g, "")
    .trim()
    .slice(0, 140);
}

function lerComCabecalho(
  camposOriginais: string[],
  cab: Cabecalho,
  sep: string,
  hojeIso: string
): Leitura | null {
  let campos = camposOriginais;
  // "25,90" sem aspas num CSV separado por vírgula vira dois campos: junta.
  if (
    sep === "," &&
    campos.length === cab.colunas + 1 &&
    /^\d{1,2}$/.test(campos[cab.valor + 1] ?? "") &&
    /\d$/.test(campos[cab.valor] ?? "")
  ) {
    campos = [
      ...campos.slice(0, cab.valor),
      `${campos[cab.valor]},${campos[cab.valor + 1]}`,
      ...campos.slice(cab.valor + 2),
    ];
  }
  if (campos.length <= cab.maiorIndice) return null;

  const valor = parseValorMonetario(campos[cab.valor]);
  if (valor === null) return { tipo: "erro", motivo: "valor não reconhecido" };

  let dataIso = hojeIso;
  const dataBruta = cab.data >= 0 ? campos[cab.data] : "";
  if (dataBruta) {
    const iso = parseDataLancamento(dataBruta, hojeIso);
    if (!iso) return { tipo: "erro", motivo: "data não reconhecida" };
    dataIso = iso;
  }

  const partes: string[] = [];
  for (const i of cab.titulos) {
    const v = campos[i];
    if (v && !partes.some((p) => p.toLowerCase() === v.toLowerCase())) partes.push(v);
  }
  if (partes.length === 0) {
    const textos = campos.filter(
      (c, i) =>
        i !== cab.data && i !== cab.valor && i !== cab.categoria && LETRA.test(c) && !pareceIdentificador(c)
    );
    if (textos.length) partes.push(textos[textos.length - 1]);
  }
  const titulo = limparTitulo(partes.join(" · "));
  if (!LETRA.test(titulo)) return { tipo: "erro", motivo: "sem descrição" };

  const categoriaBanco = cab.categoria >= 0 ? campos[cab.categoria] || undefined : undefined;
  return { tipo: "ok", dataIso, titulo, valor, categoriaBanco };
}

type TipoCampo = "data" | "valor" | "texto" | "outro";

function tipoDoCampo(campo: string, hojeIso: string): TipoCampo {
  if (!campo) return "outro";
  if (parseDataLancamento(campo, hojeIso)) return "data";
  if (ehValorEstrito(campo)) return "valor";
  if (LETRA.test(campo) && !pareceIdentificador(campo)) return "texto";
  return "outro";
}

/** CSV sem cabeçalho: precisa de 3+ campos, com uma data e um valor. */
function lerSemCabecalho(camposOriginais: string[], sep: string, hojeIso: string): Leitura | null {
  let campos = camposOriginais;
  const n = campos.length;
  if (
    sep === "," &&
    n >= 4 &&
    /^\d{2}$/.test(campos[n - 1]) &&
    /^[-(]?(?:R\$)?\s*-?\d{1,3}(?:\.\d{3})*$|^-?\d+$/.test(campos[n - 2])
  ) {
    campos = [...campos.slice(0, n - 2), `${campos[n - 2]},${campos[n - 1]}`];
  }
  if (campos.length < 3) return null;

  const tipos = campos.map((c) => tipoDoCampo(c, hojeIso));
  const iData = tipos.indexOf("data");
  const iValor = tipos.lastIndexOf("valor");
  if (iData < 0 || iValor < 0) return null;

  const textos = tipos.flatMap((t, i) => (t === "texto" ? [i] : []));
  const antes = textos.filter((i) => i < iValor);
  const iTitulo = antes.length ? antes[antes.length - 1] : textos[textos.length - 1];
  if (iTitulo === undefined) return { tipo: "erro", motivo: "sem descrição" };

  return {
    tipo: "ok",
    dataIso: parseDataLancamento(campos[iData], hojeIso) ?? hojeIso,
    titulo: limparTitulo(campos[iTitulo]),
    valor: parseValorMonetario(campos[iValor]) ?? 0,
    // Formato antigo "data,categoria,título,valor": o 1º texto é a categoria.
    categoriaBanco: antes.length > 1 ? campos[antes[0]] : undefined,
  };
}

// Valor no fim da linha. O sinal só conta colado ao número ou ao "R$":
// em "Jantar - R$ 120,00" o traço é separador, não negativo.
const RE_VALOR_FINAL =
  /(?:^|[\s.,;:=_|*\-–—])((?:\(\s*)?(?:[-−+](?=R\$|\d))?(?:(?:R\$|US\$|U\$|USD|EUR|€|BRL)\s*)?(?:[-−+](?=\d))?\d[\d.,]*(?:\s*\))?-?)(\s*(?:reais|real|brl))?\s*$/i;

function lerTextoLivre(linha: string, hojeIso: string): Leitura {
  let resto = linha.normalize("NFC").trim();
  let dataIso = hojeIso;

  const md = RE_DATA_INICIAL.exec(semAcentos(resto));
  if (md) {
    const iso = parseDataLancamento(md[1], hojeIso);
    if (iso) {
      dataIso = iso;
      resto = resto.slice(md[0].length).replace(/^[\s;,|:\-–—]+/, "");
    }
  }

  const mv = RE_VALOR_FINAL.exec(resto);
  if (!mv) return { tipo: "erro", motivo: "nenhum valor encontrado" };
  const token = mv[1];
  if (MOEDA_ESTRANGEIRA.test(token)) return { tipo: "erro", motivo: "valor em moeda estrangeira" };
  if (!temFormatoMonetario(token, mv[2] ?? "")) {
    return { tipo: "erro", motivo: "valor sem centavos nem R$ (ex.: 25,00)" };
  }
  const valor = parseValorMonetario(token);
  if (valor === null) return { tipo: "erro", motivo: "valor não reconhecido" };

  const titulo = limparTitulo(resto.slice(0, mv.index));
  if (!LETRA.test(titulo)) return { tipo: "erro", motivo: "sem descrição" };
  return { tipo: "ok", dataIso, titulo, valor };
}

/* ------------------------- Pagamentos e estornos ------------------------- */

const IGNORAR_TERMOS: { motivo: string; termos: string[] }[] = [
  {
    motivo: "pagamento da fatura (não é gasto novo)",
    termos: [
      "pagamento recebido", "pagamento efetuado", "pagamento de fatura",
      "pagamento da fatura", "pagamento fatura", "pgto fatura", "pagto fatura",
      "pag fatura",
    ],
  },
  { motivo: "estorno (devolução de compra)", termos: ["estorno", "estornado"] },
  {
    motivo: "linha de saldo ou total",
    termos: [
      "saldo", "subtotal", "total da fatura", "total de compras", "total a pagar",
      "total geral", "valor total", "limite disponivel", "limite total",
    ],
  },
];

/** Termo como palavra inteira no texto normalizado (" palavra palavra "). */
const comEspacos = (termos: string[]) => termos.map((t) => ` ${t} `);

const IGNORAR = IGNORAR_TERMOS.map((r) => ({ motivo: r.motivo, termos: comEspacos(r.termos) }));

const ENTRADAS = comEspacos([
  "pix recebido", "transferencia recebida", "ted recebida", "doc recebido",
  "deposito", "salario", "rendimento", "resgate", "credito em conta",
]);

function contemTermo(textoNormalizado: string, termos: string[]): boolean {
  return termos.some((t) => textoNormalizado.includes(t));
}

/** `t` = título já normalizado (`normalizarTexto`). */
function motivoParaIgnorar(t: string): string | null {
  if (t.trim() === "total") return "linha de saldo ou total";
  for (const regra of IGNORAR) {
    if (contemTermo(t, regra.termos)) return regra.motivo;
  }
  return null;
}

/* -------------------------------- Entrada -------------------------------- */

/** Lê o texto de uma fatura/extrato e devolve os gastos e as linhas puladas. */
export function importarExtrato(texto: string, hojeIso: string): ResultadoImportacao {
  const linhas = texto.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const candidatos: Candidato[] = [];
  const ignoradas: LinhaIgnorada[] = [];
  let cabecalho: { cab: Cabecalho; sep: string } | null = null;
  let algumCsv = false;
  let cabecalhoComSaldo = false;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;
    const numero = i + 1;
    const textoCurto = linha.slice(0, 160);

    const sep = detectarSeparador(linha);
    const campos = sep ? dividirCampos(linha, sep) : [];
    if (sep) {
      const cab = detectarCabecalho(campos, hojeIso);
      if (cab) {
        cabecalho = { cab, sep };
        cabecalhoComSaldo = cabecalhoComSaldo || cab.temSaldo;
        continue;
      }
    }
    // Títulos de seção ("COMPRAS NACIONAIS") não têm números: pula calado.
    if (!/\d/.test(linha)) continue;

    // Com cabeçalho ativo, a linha segue as colunas dele (inclusive nos
    // erros); sem cabeçalho, tenta CSV solto e por fim texto livre.
    let leitura: Leitura | null = null;
    if (sep) {
      if (cabecalho && cabecalho.sep === sep) {
        leitura = lerComCabecalho(campos, cabecalho.cab, sep, hojeIso);
      }
      if (!leitura) leitura = lerSemCabecalho(campos, sep, hojeIso);
      if (leitura) algumCsv = true;
    }
    if (!leitura) leitura = lerTextoLivre(linha, hojeIso);

    if (leitura.tipo === "erro") {
      ignoradas.push({ linha: numero, texto: textoCurto, motivo: leitura.motivo });
      continue;
    }
    const tituloNormalizado = normalizarTexto(leitura.titulo);
    const motivo = motivoParaIgnorar(tituloNormalizado);
    if (motivo) {
      ignoradas.push({ linha: numero, texto: textoCurto, motivo });
      continue;
    }
    if (leitura.valor === 0) {
      ignoradas.push({ linha: numero, texto: textoCurto, motivo: "valor zerado" });
      continue;
    }
    candidatos.push({
      linha: numero,
      texto: textoCurto,
      dataIso: leitura.dataIso,
      titulo: leitura.titulo,
      valor: leitura.valor,
      categoriaBanco: leitura.categoriaBanco,
      tituloNormalizado,
    });
  }

  // Extrato de conta: saídas negativas são a maioria, ou o arquivo tem saldo,
  // ou há entradas típicas de conta (Pix recebido, salário) com valor positivo.
  const negativos = candidatos.filter((c) => c.valor < 0).length;
  const positivos = candidatos.length - negativos;
  const temEntrada = candidatos.some(
    (c) => c.valor > 0 && contemTermo(c.tituloNormalizado, ENTRADAS)
  );
  const conta = negativos > 0 && (negativos > positivos || cabecalhoComSaldo || temEntrada);
  const formato: FormatoExtrato = conta ? "conta" : algumCsv ? "cartao" : "texto";

  const itens: LancamentoImportado[] = [];
  for (const c of candidatos) {
    const naoEhGasto = conta ? c.valor > 0 : c.valor < 0;
    if (naoEhGasto) {
      ignoradas.push({
        linha: c.linha,
        texto: c.texto,
        motivo: conta ? "entrada na conta (valor positivo)" : "crédito ou pagamento (valor negativo)",
      });
      continue;
    }
    itens.push({
      linha: c.linha,
      dataIso: c.dataIso,
      titulo: c.titulo,
      valor: Math.abs(c.valor),
      ...(c.categoriaBanco ? { categoriaBanco: c.categoriaBanco } : {}),
    });
  }
  ignoradas.sort((a, b) => a.linha - b.linha);
  return { itens, ignoradas, formato };
}
