/**
 * Concierge (interpretador de linguagem natural, lado cliente).
 *
 * Extrai origem, destino, datas e passageiros de uma frase em PT-BR como:
 *   "quero ir de Belo Horizonte para o Rio de Janeiro de 10/07 a 15/07"
 *   "passagem de SP pra Salvador em dezembro, 2 pessoas"
 *   "uma praia no nordeste a partir de 20/01"
 *
 * Entende conceitos amplos (regiões, "praia", "serra", apelidos de cidade) e
 * resolve a cidade para um código IATA quando conhecido. É determinístico (sem
 * chamada externa), então funciona offline e nunca quebra o build.
 */

export interface ConciergeParse {
  originCity?: string;
  destinationCity?: string;
  originIata?: string;
  destinationIata?: string;
  departDate?: string; // ISO yyyy-mm-dd
  returnDate?: string; // ISO yyyy-mm-dd
  passengers?: number;
}

/**
 * Dicionário cidade/apelido → código IATA do aeroporto principal.
 * Cobre as principais cidades brasileiras e alguns destinos internacionais.
 * Chaves sem acento e em minúsculas (a busca normaliza a entrada).
 */
const IATA_CONHECIDOS: Record<string, string> = {
  // Sudeste
  "belo horizonte": "CNF", bh: "CNF", confins: "CNF", pampulha: "PLU",
  "sao paulo": "GRU", sp: "GRU", guarulhos: "GRU", congonhas: "CGH",
  "rio de janeiro": "GIG", rio: "GIG", galeao: "GIG", "santos dumont": "SDU",
  vitoria: "VIX", campinas: "VCP", "ribeirao preto": "RAO",
  // Sul
  "porto alegre": "POA", curitiba: "CWB", florianopolis: "FLN", floripa: "FLN",
  "foz do iguacu": "IGU", londrina: "LDB", "caxias do sul": "CXJ",
  // Centro-Oeste
  brasilia: "BSB", bsb: "BSB", goiania: "GYN", "campo grande": "CGR", cuiaba: "CGB",
  // Nordeste
  salvador: "SSA", recife: "REC", fortaleza: "FOR", natal: "NAT",
  "joao pessoa": "JPA", maceio: "MCZ", aracaju: "AJU", "sao luis": "SLZ",
  teresina: "THE", "porto seguro": "BPS", ilheus: "IOS", petrolina: "PNZ",
  jericoacoara: "JJD", fernando: "FEN", "fernando de noronha": "FEN",
  // Norte
  manaus: "MAO", belem: "BEL", "porto velho": "PVH", "rio branco": "RBR",
  palmas: "PMW", "boa vista": "BVB", macapa: "MCP", santarem: "STM",
  // Destinos turísticos / apelidos comuns
  "cabo frio": "CFB", buzios: "CFB", "armacao dos buzios": "CFB",
  "angra dos reis": "GIG", paraty: "GIG", "campos do jordao": "GRU",
  gramado: "CXJ", "balneario camboriu": "NVT", navegantes: "NVT",
  bonito: "BYO", "chapada diamantina": "LEC", lencois: "LEC",
  // Internacionais frequentes
  lisboa: "LIS", porto: "OPO", madri: "MAD", madrid: "MAD", barcelona: "BCN",
  paris: "CDG", londres: "LHR", "nova york": "JFK", "nova iorque": "JFK",
  miami: "MIA", orlando: "MCO", "buenos aires": "EZE", santiago: "SCL",
  roma: "FCO", lima: "LIM", cancun: "CUN", montevideu: "MVD",
};

/**
 * Conceitos amplos → cidade sugerida. Permite frases como "uma praia no
 * nordeste" ou "quero ir para a serra" virarem um destino concreto.
 */
const CONCEITOS: Record<string, string> = {
  praia: "Rio de Janeiro",
  "praia no nordeste": "Salvador",
  nordeste: "Salvador",
  serra: "Gramado",
  montanha: "Campos do Jordão",
  "campo": "Campos do Jordão",
  praias: "Florianópolis",
  sul: "Florianópolis",
  "centro-oeste": "Brasília",
  ecoturismo: "Bonito",
  historico: "Ouro Preto",
  "cidade historica": "Ouro Preto",
  internacional: "Lisboa",
  europa: "Lisboa",
};

/** Normaliza texto: sem acento, minúsculo, sem espaços extras. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Resolve o IATA de uma cidade/apelido conhecido (ou undefined). */
export function iataDaCidade(cidade: string): string | undefined {
  return IATA_CONHECIDOS[norm(cidade)];
}

/** Normaliza datas em dd/mm, dd/mm/aaaa ou aaaa-mm-dd para ISO yyyy-mm-dd. */
function normalizaData(bruto: string): string | undefined {
  const t = bruto.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = t.match(/^(\d{1,2})[/\-](\d{1,2})$/);
  if (m) {
    const ano = new Date().getFullYear();
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return undefined;
}

/** Nomes de mês em PT-BR → número (para frases como "em dezembro"). */
const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** Resolve um campo de origem/destino em cidade + IATA. */
function resolveLocal(bruto: string): {
  city?: string;
  iata?: string;
} {
  const limpo = limpaCidade(bruto);
  if (!limpo) return {};
  // Código IATA digitado diretamente (3 letras).
  if (/^[a-z]{3}$/i.test(limpo)) return { iata: limpo.toUpperCase() };
  // Conceito amplo (praia, nordeste, serra...).
  const conceito = CONCEITOS[norm(limpo)];
  if (conceito) return { city: conceito, iata: iataDaCidade(conceito) };
  // Cidade/apelido conhecido.
  return { city: capitaliza(limpo), iata: iataDaCidade(limpo) };
}

/** Interpreta uma frase livre e devolve os campos reconhecidos. */
export function interpretarBusca(frase: string): ConciergeParse {
  const texto = frase.trim();
  const out: ConciergeParse = {};

  // 1) Origem/destino no formato "de X para/até/a Y".
  const rota = texto.match(
    /\bde\s+(.+?)\s+(?:para|pra|até|ate|a)\s+(?:o\s+|a\s+)?(.+?)(?:\s+(?:de|dia|em|no dia|entre|a partir|,|\.|$))/i
  );
  if (rota) {
    const o = resolveLocal(rota[1]);
    const d = resolveLocal(rota[2]);
    out.originCity = o.city;
    out.originIata = o.iata;
    out.destinationCity = d.city;
    out.destinationIata = d.iata;
  } else {
    // 2) Só destino: "para/pra <lugar>" ou "quero <conceito>".
    const soDestino = texto.match(
      /\b(?:para|pra|até|ate|conhecer|visitar|ir a|ir para)\s+(?:o\s+|a\s+)?(.+?)(?:\s+(?:de|dia|em|no dia|entre|a partir|,|\.|$))/i
    );
    if (soDestino) {
      const d = resolveLocal(soDestino[1]);
      out.destinationCity = d.city;
      out.destinationIata = d.iata;
    } else {
      // 3) Conceito solto na frase ("uma praia no nordeste").
      for (const chave of Object.keys(CONCEITOS)) {
        if (norm(texto).includes(chave)) {
          const cidade = CONCEITOS[chave];
          out.destinationCity = cidade;
          out.destinationIata = iataDaCidade(cidade);
          break;
        }
      }
    }
  }

  // Datas explícitas (ida e volta).
  const datas = [
    ...texto.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?)\b/g),
  ]
    .map((m) => normalizaData(m[1]))
    .filter((d): d is string => Boolean(d));
  if (datas[0]) out.departDate = datas[0];
  if (datas[1]) out.returnDate = datas[1];

  // Mês por extenso ("em dezembro") → primeiro dia do mês.
  if (!out.departDate) {
    const mesMatch = norm(texto).match(
      /\bem\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/
    );
    if (mesMatch) {
      const mes = MESES[mesMatch[1]];
      const hoje = new Date();
      let ano = hoje.getFullYear();
      if (mes <= hoje.getMonth() + 1) ano += 1; // mês já passou → próximo ano
      out.departDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
    }
  }

  // Passageiros.
  const pax = texto.match(
    /(\d+)\s*(?:pessoa|pessoas|passageiro|passageiros|adulto|adultos|h[óo]spede|h[óo]spedes)/i
  );
  if (pax) out.passengers = Math.max(1, parseInt(pax[1], 10) || 1);

  return out;
}

function limpaCidade(s: string): string {
  return s
    .replace(/\b(o|a|os|as|uma|um|minha|nossa)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capitaliza(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}
