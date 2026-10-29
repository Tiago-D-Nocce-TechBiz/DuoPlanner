/**
 * Concierge de IA (interpretador de linguagem natural, lado cliente).
 *
 * Extrai origem, destino e datas de uma frase em PT-BR como:
 *   "quero ir de Belo Horizonte para o Rio de Janeiro de 10/07 a 15/07"
 *   "passagem CNF para GIG dia 2027-07-10 voltando 2027-07-15, 2 pessoas"
 *
 * É determinístico (sem chamada externa), então funciona offline e nunca
 * quebra o build. Serve de "preenchimento inteligente" dos formulários de
 * busca. Um LLM pode ser plugado depois para casos mais livres.
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

const IATA_CONHECIDOS: Record<string, string> = {
  "belo horizonte": "CNF",
  confins: "CNF",
  pampulha: "PLU",
  "sao paulo": "GRU",
  "são paulo": "GRU",
  guarulhos: "GRU",
  congonhas: "CGH",
  "rio de janeiro": "GIG",
  galeao: "GIG",
  galeão: "GIG",
  "santos dumont": "SDU",
  brasilia: "BSB",
  brasília: "BSB",
  salvador: "SSA",
  recife: "REC",
  fortaleza: "FOR",
  "porto alegre": "POA",
  curitiba: "CWB",
  florianopolis: "FLN",
  florianópolis: "FLN",
  "foz do iguacu": "IGU",
  "foz do iguaçu": "IGU",
};

/** Resolve o IATA de uma cidade conhecida (ou undefined). */
export function iataDaCidade(cidade: string): string | undefined {
  const chave = cidade
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return IATA_CONHECIDOS[chave] ?? IATA_CONHECIDOS[cidade.toLowerCase().trim()];
}

/** Normaliza datas em dd/mm, dd/mm/aaaa ou aaaa-mm-dd para ISO yyyy-mm-dd. */
function normalizaData(bruto: string): string | undefined {
  const t = bruto.trim();
  // aaaa-mm-dd
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/aaaa ou dd-mm-aaaa
  m = t.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // dd/mm (assume ano corrente ou próximo)
  m = t.match(/^(\d{1,2})[/\-](\d{1,2})$/);
  if (m) {
    const ano = new Date().getFullYear();
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return undefined;
}

/** Interpreta uma frase livre e devolve os campos reconhecidos. */
export function interpretarBusca(frase: string): ConciergeParse {
  const texto = frase.trim();
  const out: ConciergeParse = {};

  // Origem/destino: "de X para/até/a Y"
  const rota = texto.match(
    /\bde\s+(.+?)\s+(?:para|pra|até|ate|a)\s+(?:o\s+|a\s+)?(.+?)(?:\s+(?:de|dia|em|no dia|entre|a partir|,|\.|$))/i
  );
  if (rota) {
    const origem = limpaCidade(rota[1]);
    const destino = limpaCidade(rota[2]);
    if (origem) {
      if (/^[a-z]{3}$/i.test(origem)) out.originIata = origem.toUpperCase();
      else {
        out.originCity = capitaliza(origem);
        out.originIata = iataDaCidade(origem);
      }
    }
    if (destino) {
      if (/^[a-z]{3}$/i.test(destino)) out.destinationIata = destino.toUpperCase();
      else {
        out.destinationCity = capitaliza(destino);
        out.destinationIata = iataDaCidade(destino);
      }
    }
  }

  // Datas: pega até duas (ida e volta)
  const datas = [
    ...texto.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?)\b/g),
  ]
    .map((m) => normalizaData(m[1]))
    .filter((d): d is string => Boolean(d));
  if (datas[0]) out.departDate = datas[0];
  if (datas[1]) out.returnDate = datas[1];

  // Passageiros
  const pax = texto.match(/(\d+)\s*(?:pessoa|pessoas|passageiro|passageiros|adulto|adultos|h[óo]spede|h[óo]spedes)/i);
  if (pax) out.passengers = Math.max(1, parseInt(pax[1], 10) || 1);

  return out;
}

function limpaCidade(s: string): string {
  return s.replace(/\b(o|a|os|as)\b/gi, "").replace(/\s+/g, " ").trim();
}

function capitaliza(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}
