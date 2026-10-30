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

/** Intenção de busca inferida da frase, sem o usuário escolher um modo. */
export type ConciergeIntencao = "passagens" | "hospedagem";

/** Palavras que indicam busca de hospedagem. */
const PISTAS_HOSPEDAGEM = [
  "hospedagem", "hospedar", "hotel", "hoteis", "hotéis", "pousada", "pousadas",
  "airbnb", "booking", "resort", "hostel", "flat", "chalé", "chale", "chalés",
  "quarto", "quartos", "diaria", "diária", "diarias", "diárias", "estadia",
  "acomodacao", "acomodação", "acomodacoes", "acomodações", "dormir", "ficar em",
  "noites", "check-in", "checkin", "casa de temporada", "apartamento",
];

/** Palavras que indicam busca de passagens (voo/ônibus). */
const PISTAS_PASSAGENS = [
  "passagem", "passagens", "voo", "voos", "voar", "aviao", "avião", "aereo",
  "aéreo", "aerea", "aérea", "onibus", "ônibus", "rodoviaria", "rodoviária",
  "viajar de", "ida e volta", "so ida", "só ida", "voe", "latam", "gol", "azul",
];

/**
 * Infere se a frase trata de HOSPEDAGEM ou PASSAGENS a partir de palavras-chave.
 * Sem pistas claras, assume "passagens" (ponto de partida natural da viagem).
 */
export function inferirIntencao(frase: string): ConciergeIntencao {
  const t = norm(frase);
  const pontosHosp = PISTAS_HOSPEDAGEM.reduce((n, k) => (t.includes(norm(k)) ? n + 1 : n), 0);
  const pontosPass = PISTAS_PASSAGENS.reduce((n, k) => (t.includes(norm(k)) ? n + 1 : n), 0);
  if (pontosHosp > pontosPass) return "hospedagem";
  return "passagens";
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
  // Cidade/apelido conhecido tem prioridade (ex.: "rio", "sp", "bh" são
  // apelidos de cidade, não códigos IATA).
  const iataConhecido = iataDaCidade(limpo);
  if (iataConhecido) return { city: capitaliza(limpo), iata: iataConhecido };
  // Conceito amplo (praia, nordeste, serra...).
  const conceito = CONCEITOS[norm(limpo)];
  if (conceito) return { city: conceito, iata: iataDaCidade(conceito) };
  // Código IATA digitado diretamente (3 letras) quando não é apelido conhecido.
  if (/^[a-z]{3}$/i.test(limpo)) return { iata: limpo.toUpperCase() };
  // Cidade desconhecida: mantém o nome (a busca por deep link aceita cidade).
  return { city: capitaliza(limpo) };
}

/**
 * Remove a parte de datas/passageiros do fim da frase, deixando só o trecho de
 * rota (origem/destino). Assim "belo horizonte para cabo frio dia 12/08, 2
 * pessoas" vira "belo horizonte para cabo frio" antes de separar origem/destino.
 */
function recortaTrechoRota(texto: string): string {
  // Corta a partir do primeiro marcador de data/período/passageiros.
  const corte = texto.search(
    /\b(?:de\s+\d|dia\s+\d|em\s+\d|no dia|entre|a partir|\d{1,2}[/\-]\d|\d+\s*(?:pessoa|passageiro|adulto|h[óo]spede)|em\s+(?:janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))/i
  );
  let base = corte >= 0 ? texto.slice(0, corte) : texto;

  // Remove, de forma iterativa, aberturas comuns empilhadas que não fazem
  // parte da origem/destino (ex.: "quero ir de ...", "gostaria de viajar
  // para ..."). Para no conector que define a rota ("de/para/pra/a" seguido
  // de uma palavra que não seja outro verbo de abertura).
  const INTRO = /^\s*(?:quero|queria|gostaria|vou|vamos|preciso|procuro|busco|buscar|pesquisar|me\s+leve|me\s+hospedar|hospedar(?:-me)?|ficar|dormir|passagem|passagens|passagem\s+aerea|viagem|viajar|ir|voar|voo|voos|onibus|ônibus|hotel|hoteis|hotéis|pousada|pousadas|airbnb|booking|hospedagem|acomodacao|acomodação|estadia|reservar|reserva)\b\s*/i;
  let anterior = "";
  while (base !== anterior) {
    anterior = base;
    base = base.replace(INTRO, "");
  }
  // Remove conector pendurado no fim ("...gramado para" → "...gramado"), que
  // sobra quando a parte de passageiros/datas foi recortada após o conector.
  base = base.replace(/\s+(?:para|pra|a|até|ate|de|em|no|na|rumo a|com destino a)\s*$/i, "");
  // Se sobrou um "de " logo no início (ex.: "de Belo Horizonte"), ele é o
  // marcador de origem e será tratado adiante; mantemos.
  return base.replace(/[,.;]+\s*$/g, "").trim();
}

/** Interpreta uma frase livre e devolve os campos reconhecidos. */
export function interpretarBusca(frase: string): ConciergeParse {
  const texto = frase.trim();
  const out: ConciergeParse = {};

  const trecho = recortaTrechoRota(texto);

  // 1) Rota "de X para/até/a Y" OU "X para/até/pra/-> Y" (o "de" é opcional).
  //    Separa pelo conector e resolve cada lado, sem depender de delimitador
  //    final — por isso funciona mesmo quando o destino termina a frase.
  const conector = /\s+(?:para|pra|até|ate|->|➜|→|rumo a|com destino a)\s+(?:o\s+|a\s+|ao\s+|os\s+|as\s+)?/i;
  const partesRota = trecho.replace(/^de\s+/i, "").split(conector);

  if (partesRota.length >= 2 && partesRota[0].trim() && partesRota[1].trim()) {
    const o = resolveLocal(partesRota[0]);
    const d = resolveLocal(partesRota[1]);
    out.originCity = o.city;
    out.originIata = o.iata;
    out.destinationCity = d.city;
    out.destinationIata = d.iata;
  } else {
    // 2) Só destino: "para/pra/conhecer/visitar/em/no/na <lugar>" até o fim.
    //    Inclui "em/no/na" para frases de hospedagem ("hotel em Gramado").
    const soDestino = trecho.match(
      /\b(?:para|pra|até|ate|conhecer|visitar|ir a|ir para|rumo a|destino|em|no|na|nos|nas)\s+(?:o\s+|a\s+|ao\s+)?(.+)$/i
    );
    if (soDestino && soDestino[1].trim()) {
      const d = resolveLocal(soDestino[1]);
      out.destinationCity = d.city;
      out.destinationIata = d.iata;
    } else {
      // 3) Conceito solto na frase ("uma praia no nordeste").
      let achouConceito = false;
      for (const chave of Object.keys(CONCEITOS)) {
        if (norm(texto).includes(chave)) {
          const cidade = CONCEITOS[chave];
          out.destinationCity = cidade;
          out.destinationIata = iataDaCidade(cidade);
          achouConceito = true;
          break;
        }
      }
      // 4) Último recurso: uma única cidade conhecida citada na frase vira o
      //    destino (ex.: "quero ir para Salvador" sem conector reconhecido, ou
      //    apenas "Fortaleza").
      if (!achouConceito) {
        const soCidade = resolveLocal(trecho);
        if (soCidade.city || soCidade.iata) {
          out.destinationCity = soCidade.city;
          out.destinationIata = soCidade.iata;
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
    // Remove preposições/artigos de ligação no início (de, em, no, na, para…).
    .replace(/^\s*(?:de|do|da|dos|das|em|no|na|nos|nas|para|pra|ao|aos|a)\s+/i, "")
    // Remove artigos/qualificadores soltos no meio.
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
