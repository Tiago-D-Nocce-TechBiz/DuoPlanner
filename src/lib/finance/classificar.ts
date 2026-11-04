/**
 * Classificador de despesas das Finanças Duo (puro, sem React nem storage).
 *
 * Regras:
 * - Compara PALAVRAS INTEIRAS ou frases, nunca trechos: "util" não casa com
 *   "Utilidades", "posto" não casa com "Imposto", "mercado" não casa com
 *   "Mercado Livre" (que tem regra própria de gasto pessoal).
 * - A primeira regra que casar vence; a ordem resolve conflitos
 *   ("Uber Eats" é comida antes de "Uber" ser transporte; "Azul Seguros" é
 *   pessoal antes de qualquer regra de viagem).
 * - Na dúvida, privado: o que nenhuma regra reconhece fica como gasto
 *   pessoal e nunca entra na divisão da dupla.
 */

export type Categoria =
  | "Passagens & Transporte"
  | "Hospedagem"
  | "Alimentação & Gastronomia"
  | "Passeios & Lazer"
  | "Gasto Pessoal (Fora da Viagem)";

export type Escopo = "viagem_compartilhado" | "pessoal_privado";

/** Todas as categorias, na ordem exibida nos seletores (tupla: serve ao z.enum). */
export const CATEGORIAS = [
  "Passagens & Transporte",
  "Hospedagem",
  "Alimentação & Gastronomia",
  "Passeios & Lazer",
  "Gasto Pessoal (Fora da Viagem)",
] as const satisfies readonly Categoria[];

export const ESCOPOS = ["viagem_compartilhado", "pessoal_privado"] as const satisfies readonly Escopo[];

export interface Classificacao {
  categoria: Categoria;
  escopo: Escopo;
}

interface Regra extends Classificacao {
  termos: string[];
}

/**
 * Normaliza para comparação: minúsculas, sem acentos, qualquer coisa que não
 * seja letra/dígito vira espaço. Fica com espaços nas pontas para que
 * `includes(" termo ")` signifique "palavra inteira".
 */
export function normalizarTexto(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${base} `;
}

const REGRAS: Regra[] = [
  // Seguro viagem vem antes da regra geral de "seguro" (pessoal).
  {
    categoria: "Passagens & Transporte",
    escopo: "viagem_compartilhado",
    termos: ["seguro viagem", "seguro de viagem", "assist card", "travel ace"],
  },
  // Pessoal: termos que, sem esta regra, cairiam numa categoria da viagem.
  {
    categoria: "Gasto Pessoal (Fora da Viagem)",
    escopo: "pessoal_privado",
    termos: [
      "mercado livre", "mercadolivre", "mercado pago", "mercadopago",
      "seguro", "seguros", "saude", "plano de saude", "academia",
      "farmacia", "drogaria", "drogasil", "droga raia", "assinatura",
      "streaming", "mensalidade", "consulta",
    ],
  },
  // Delivery: precisa vir antes de "uber" (transporte).
  {
    categoria: "Alimentação & Gastronomia",
    escopo: "viagem_compartilhado",
    termos: [
      "uber eats", "ubereats", "ifood", "ifd", "rappi", "99 food", "99food",
      "aiqfome",
    ],
  },
  {
    categoria: "Hospedagem",
    escopo: "viagem_compartilhado",
    termos: [
      "airbnb", "booking", "hoteis", "hotel", "pousada", "resort",
      "hospedagem", "hostel", "vrbo", "expedia", "trivago", "flat", "chale",
      "chales", "hurb", "ibis", "accor", "mercure", "novotel",
    ],
  },
  {
    categoria: "Passagens & Transporte",
    escopo: "viagem_compartilhado",
    termos: [
      // Aéreas: nomes ambíguos ("azul", "gol") só em frase.
      "latam", "azul linhas", "voeazul", "azul viagens", "gol linhas",
      "voegol", "gol transportes", "linhas aereas", "airline", "airlines",
      "avianca",
      "tap air", "tap portugal", "copa airlines", "jetsmart", "aerolineas",
      "decolar", "cvc", "123milhas", "maxmilhas", "skyscanner", "viajanet",
      "viagem", "viagens", "passagem", "passagens", "taxa de embarque",
      // Rodoviário: "util" e "cometa" só como "viação ...".
      "buser", "clickbus", "flixbus", "deonibus", "gontijo", "itapemirim",
      "aguia branca", "expresso guanabara", "viacao", "rodoviaria", "onibus",
      // Mobilidade: "99" só nos nomes do app.
      "uber", "99app", "99 app", "99 taxi", "99taxi", "99pop", "99 pop",
      "99 tecnologia", "cabify", "indrive", "taxi", "blablacar",
      // Estrada e carro alugado.
      "pedagio", "sem parar", "conectcar", "veloe", "posto", "auto posto",
      "combustivel", "gasolina", "etanol", "shell", "ipiranga", "petrobras",
      "localiza", "movida", "unidas", "hertz", "rentcars",
    ],
  },
  {
    categoria: "Passeios & Lazer",
    escopo: "viagem_compartilhado",
    termos: [
      "ingresso", "ingressos", "parque", "tour", "tours", "passeio",
      "passeios", "museu", "cinema", "show", "balada", "ticket",
      "beach club", "mergulho", "escuna", "trilha", "lazer", "bilheteria",
      "sympla", "eventim", "ticketmaster", "aquario", "teleferico",
      "bondinho",
    ],
  },
  {
    categoria: "Alimentação & Gastronomia",
    escopo: "viagem_compartilhado",
    termos: [
      "restaurante", "bar", "boteco", "quiosque", "padaria", "panificadora",
      "confeitaria", "lanchonete", "lanches", "mercado", "supermercado",
      "cafe", "cafeteria", "almoco", "jantar", "janta", "lanche", "pizzaria",
      "pizza", "hamburgueria", "burger", "churrascaria", "sorveteria",
      "acai", "bistro", "sushi", "cervejaria", "choperia", "food",
    ],
  },
];

// Termos pré-normalizados uma vez (mesma normalização do texto comparado).
const REGRAS_NORMALIZADAS = REGRAS.map((r) => ({
  ...r,
  termos: r.termos.map((t) => normalizarTexto(t)),
}));

const PADRAO: Classificacao = {
  categoria: "Gasto Pessoal (Fora da Viagem)",
  escopo: "pessoal_privado",
};

function aplicarRegras(texto: string): Classificacao | null {
  const t = normalizarTexto(texto);
  for (const regra of REGRAS_NORMALIZADAS) {
    if (regra.termos.some((termo) => t.includes(termo))) {
      return { categoria: regra.categoria, escopo: regra.escopo };
    }
  }
  return null;
}

/**
 * Classifica uma despesa pela descrição. `dica` é a categoria que o banco
 * informou no extrato (ex.: "restaurante"); só é usada quando a descrição
 * sozinha não casa com nenhuma regra.
 */
export function classificarDespesa(titulo: string, dica?: string): Classificacao {
  return aplicarRegras(titulo) ?? (dica ? aplicarRegras(dica) : null) ?? PADRAO;
}
