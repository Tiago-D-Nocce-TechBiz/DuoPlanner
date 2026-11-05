/**
 * Motor determinístico de análise de faturas de cartão de crédito — DuoFinance.
 *
 * Primeira etapa do pipeline híbrido (determinística). A segunda etapa
 * (enriquecimento semântico via Gemini, com fallback local) vive em
 * `src/app/dashboard/financas/analyze-invoice.ts`.
 *
 * Reaproveita o parser já testado de `./importar` (valores em BRL, datas
 * brasileiras, detecção de pagamentos/estornos e de cartão x conta) e
 * acrescenta:
 *  - detecção de parcelas (01/12, 1/12, PARC 02/10, "Parcela 3 de 6", "3x");
 *  - cálculo de comprometimento futuro (saldo a vencer, meses restantes);
 *  - um dicionário local com 100+ estabelecimentos comuns no Brasil que
 *    produz nome limpo, "o que foi gasto", categoria, ícone e escopo sugerido
 *    quando não há IA configurada (fallback que nunca falha).
 *
 * Puro e determinístico: "hoje" chega por parâmetro, então os testes não
 * dependem do relógio. Nada aqui grava dados.
 */

import { isoToBR } from "@/lib/dates";
import { CATEGORIAS_DUOFINANCE, ICONE_POR_CATEGORIA, type CategoriaDuoFinance } from "./categorias-duofinance";
import { importarExtrato, type FormatoExtrato, type LinhaIgnorada } from "./importar";

/* ======================================================================== */
/* Categorias padronizadas (definidas em ./categorias-duofinance)           */
/* ======================================================================== */

export { CATEGORIAS_DUOFINANCE, ICONE_POR_CATEGORIA, type CategoriaDuoFinance };

export type EscopoSugerido = "compartilhado" | "pessoal_privado";

/* ======================================================================== */
/* Modelo de uma transação analisada                                        */
/* ======================================================================== */

export interface InformacaoParcela {
  isInstallment: boolean;
  /** Parcela atual (ex.: 3 em "03/10"). */
  currentInstallment: number;
  /** Total de parcelas (ex.: 10 em "03/10"). */
  totalInstallments: number;
  /** Valor cobrado NESTA fatura. */
  installmentAmount: number;
  /** Valor total da compra = parcela × total. */
  totalPurchaseAmount: number;
  /** Quanto ainda vai vencer depois desta fatura. */
  remainingAmount: number;
  /** Meses que ainda vão vencer. */
  remainingMonths: number;
}

export interface TransacaoAnalisada {
  /** Identificador estável no lote (linha de origem). */
  id: string;
  /** Linha no texto original (começa em 1). */
  linha: number;
  /** Data do lançamento, AAAA-MM-DD. */
  dataIso: string;
  /** Data formatada em pt-BR (dd/mm/aaaa) para exibição. */
  dataBR: string;
  /** Descrição exatamente como veio da fatura. */
  descricaoOriginal: string;
  /** Valor cobrado nesta fatura (sempre positivo). */
  valor: number;
  /** Moeda da compra (BRL por padrão). */
  moeda: string;

  /* --- Enriquecimento (dicionário local ou IA) --- */
  /** Nome comercial limpo e amigável (ex.: "Uber", "Mercado Livre"). */
  cleanMerchantName: string;
  /** O que foi comprado, curto e claro (ex.: "Corrida de aplicativo"). */
  whatWasBought: string;
  category: CategoriaDuoFinance;
  /** Nome do ícone correspondente (vide ICONE_POR_CATEGORIA). */
  categoryIcon: string;
  /** Privacidade sugerida; 'pessoal_privado' é o padrão seguro. */
  suggestedScope: EscopoSugerido;

  installmentInfo: InformacaoParcela;

  /** true = pagamento de fatura/estorno: não entra no cálculo de gastos. */
  ignorarNoCalculo: boolean;
  /** De onde veio o enriquecimento: dicionário local ou IA. */
  fonteEnriquecimento: "dicionario" | "ia";
}

export interface ResultadoAnaliseFatura {
  transacoes: TransacaoAnalisada[];
  ignoradas: LinhaIgnorada[];
  formato: FormatoExtrato;
  /** Referência da fatura, AAAA-MM (mês mais frequente entre as compras). */
  faturaReferencia: string;
}

/* ======================================================================== */
/* Detecção de parcelas                                                     */
/* ======================================================================== */

/**
 * Padrões capturados (ordem importa — o primeiro que casar vence):
 *  - "Parcela 3 de 6", "parc 3 de 6"
 *  - "PARC 02/10", "PARCELA 02/10"
 *  - "03/10", "3/12"       (apenas quando NÃO parece uma data)
 *  - "3 de 10"
 *  - "3x10", "3x de 10"
 */
const PADROES_PARCELA: RegExp[] = [
  /\bparc(?:ela)?\s*(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\b/i,
  /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/,
  /\b(\d{1,2})\s+de\s+(\d{1,2})\b/i,
  /\b(\d{1,2})\s*x\s*(?:de\s*)?(\d{1,2})\b/i,
];

/** "03/10" em "05/10 Uber" é data; só é parcela se for plausível. */
function parcelaPlausivel(atual: number, total: number): boolean {
  return (
    Number.isInteger(atual) &&
    Number.isInteger(total) &&
    total >= 2 &&
    total <= 72 &&
    atual >= 1 &&
    atual <= total
  );
}

const SEM_PARCELA: InformacaoParcela = {
  isInstallment: false,
  currentInstallment: 1,
  totalInstallments: 1,
  installmentAmount: 0,
  totalPurchaseAmount: 0,
  remainingAmount: 0,
  remainingMonths: 0,
};

/**
 * Detecta parcelamento numa descrição. `valorParcela` é o valor desta fatura,
 * usado para derivar total da compra e saldo a vencer.
 *
 * A heurística evita confundir a data no começo da linha ("05/10 Uber") com
 * parcela: quando o único padrão "a/b" aparece exatamente no início da string,
 * ele é ignorado (datas de texto livre ficam ali).
 */
export function detectarParcela(descricao: string, valorParcela: number): InformacaoParcela {
  for (let p = 0; p < PADROES_PARCELA.length; p++) {
    const regex = PADROES_PARCELA[p];
    const m = regex.exec(descricao);
    if (!m) continue;

    const atual = Number(m[1]);
    const total = Number(m[2]);
    if (!parcelaPlausivel(atual, total)) continue;

    // Regex simples "a/b": se casar logo no início da linha, é a data do
    // lançamento em texto livre ("05/10 ..."), não uma parcela.
    const ehRegexBarraSimples = p === 1;
    if (ehRegexBarraSimples && m.index <= 1) continue;

    const installmentAmount = Math.round(valorParcela * 100) / 100;
    const totalPurchaseAmount = Math.round(installmentAmount * total * 100) / 100;
    const remainingMonths = total - atual;
    const remainingAmount = Math.round(installmentAmount * remainingMonths * 100) / 100;
    return {
      isInstallment: true,
      currentInstallment: atual,
      totalInstallments: total,
      installmentAmount,
      totalPurchaseAmount,
      remainingAmount,
      remainingMonths,
    };
  }
  return { ...SEM_PARCELA, installmentAmount: Math.round(valorParcela * 100) / 100 };
}

/* ======================================================================== */
/* Limpeza do nome do estabelecimento                                       */
/* ======================================================================== */

/**
 * Remove ruído típico das "maquininhas" e gateways de pagamento das descrições
 * de fatura, para chegar a um nome legível antes de casar no dicionário.
 *
 * Exemplos de prefixos removidos: "PG *", "MP *" (Mercado Pago), "IFD*"/"IFood*",
 * "PagSeguro *", "PAG*", "MERCADOPAGO*", "PayPal *", "SumUp *", "Cielo*",
 * "Stone*", "Rede*", "GETNET*", "EC *", "DL*".
 */
const PREFIXOS_MAQUININHA =
  /^(?:pg|mp|ec|dl|ifd|pag|pags?eguro|pagseguro|mercadopago|mercado\s*pago|paypal|pp|sumup|cielo|stone|rede|getnet|iugu|pagarme|pagar\.?me|ame|picpay|ton|infinitepay|uol\s*pagseguro)\s*\*+\s*/i;

/** Tokens finais sem valor semântico ("help.uber.com", "www...", "trip"). */
export function limparNomeEstabelecimento(descricao: string): string {
  let s = descricao.trim();

  // Remove padrão de parcela para não sujar o nome ("Loja 03/10" → "Loja").
  s = s
    .replace(/\bparc(?:ela)?\s*\d{1,2}\s*(?:\/|\s+de\s+)\s*\d{1,2}\b/i, " ")
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/, " ")
    .replace(/\b\d{1,2}\s*x\s*(?:de\s*)?\d{1,2}\b/i, " ");

  // Remove prefixo de maquininha repetidamente (ex.: "PG *UBER *TRIP").
  let anterior;
  do {
    anterior = s;
    s = s.replace(PREFIXOS_MAQUININHA, "");
  } while (s !== anterior);

  s = s
    // URLs de suporte coladas no nome: "HELP.UBER.COM", "WWW.LOJA.COM.BR".
    .replace(/\b(?:help|www|ajuda|suporte)[.\s][\w.\-/]+/gi, " ")
    .replace(/\b[\w-]+\.(?:com|com\.br|net|app|io)(?:\.br)?\b/gi, " ")
    // Resíduos de gateway no meio ("*TRIP", "* PAGAMENTO").
    .replace(/\*+/g, " ")
    // Cidades/UF no fim ("SAO PAULO BR", "- RJ") e códigos.
    .replace(/\s[-–]\s*[A-Z]{2}\b/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Título amigável: cada palavra capitalizada, siglas curtas em maiúsculas.
  const limpo = s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 && /^[a-z]+$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

  return limpo || descricao.trim();
}

/* ======================================================================== */
/* Dicionário local (fallback): 100+ estabelecimentos comuns no Brasil      */
/* ======================================================================== */

interface EntradaDicionario {
  /** Nome comercial limpo e amigável. */
  nome: string;
  /** O que foi gasto (frase curta). */
  oque: string;
  categoria: CategoriaDuoFinance;
  escopo: EscopoSugerido;
  /** Termos que casam (palavra inteira, normalizados). */
  termos: string[];
}

/** Normaliza para comparação por palavra inteira (minúsculas, sem acento). */
function normalizar(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${base} `;
}

/**
 * Dicionário em ordem de prioridade: entradas mais específicas primeiro
 * (ex.: "uber eats" antes de "uber"; "99 food" antes de "99").
 */
const DICIONARIO: EntradaDicionario[] = [
  /* ---- Alimentação / delivery ---- */
  { nome: "Uber Eats", oque: "Restaurante / Delivery", categoria: "Alimentação", escopo: "compartilhado", termos: ["uber eats", "ubereats"] },
  { nome: "iFood", oque: "Restaurante / Delivery", categoria: "Alimentação", escopo: "compartilhado", termos: ["ifood", "ifd", "ifd br"] },
  { nome: "Rappi", oque: "Restaurante / Delivery", categoria: "Alimentação", escopo: "compartilhado", termos: ["rappi"] },
  { nome: "99Food", oque: "Restaurante / Delivery", categoria: "Alimentação", escopo: "compartilhado", termos: ["99 food", "99food"] },
  { nome: "Aiqfome", oque: "Restaurante / Delivery", categoria: "Alimentação", escopo: "compartilhado", termos: ["aiqfome"] },
  { nome: "McDonald's", oque: "Fast-food", categoria: "Alimentação", escopo: "compartilhado", termos: ["mcdonalds", "mc donalds", "arcos dorados", "bk", "mcdonald"] },
  { nome: "Burger King", oque: "Fast-food", categoria: "Alimentação", escopo: "compartilhado", termos: ["burger king", "burgerking"] },
  { nome: "Starbucks", oque: "Cafeteria", categoria: "Alimentação", escopo: "compartilhado", termos: ["starbucks"] },
  { nome: "Subway", oque: "Fast-food", categoria: "Alimentação", escopo: "compartilhado", termos: ["subway"] },
  { nome: "Habib's", oque: "Fast-food", categoria: "Alimentação", escopo: "compartilhado", termos: ["habibs", "habib s"] },
  { nome: "Outback", oque: "Restaurante", categoria: "Alimentação", escopo: "compartilhado", termos: ["outback"] },
  { nome: "Pão de Açúcar", oque: "Supermercado", categoria: "Alimentação", escopo: "compartilhado", termos: ["pao de acucar", "gpa"] },
  { nome: "Carrefour", oque: "Supermercado", categoria: "Alimentação", escopo: "compartilhado", termos: ["carrefour"] },
  { nome: "Extra", oque: "Supermercado", categoria: "Alimentação", escopo: "compartilhado", termos: ["extra hiper", "supermercado extra"] },
  { nome: "Assaí", oque: "Atacado / Supermercado", categoria: "Alimentação", escopo: "compartilhado", termos: ["assai", "assai atacadista"] },
  { nome: "Atacadão", oque: "Atacado / Supermercado", categoria: "Alimentação", escopo: "compartilhado", termos: ["atacadao"] },
  { nome: "Dia", oque: "Supermercado", categoria: "Alimentação", escopo: "compartilhado", termos: ["supermercado dia", "dia supermercado"] },
  { nome: "Zé Delivery", oque: "Bebidas / Delivery", categoria: "Alimentação", escopo: "compartilhado", termos: ["ze delivery", "zedelivery", "ambev"] },

  /* ---- Transporte / mobilidade ---- */
  { nome: "Uber", oque: "Corrida de aplicativo", categoria: "Transporte", escopo: "compartilhado", termos: ["uber", "uber trip", "uber br"] },
  { nome: "99", oque: "Corrida de aplicativo", categoria: "Transporte", escopo: "compartilhado", termos: ["99app", "99 app", "99 tecnologia", "99 taxi", "99taxi", "99 pop", "99pop"] },
  { nome: "Cabify", oque: "Corrida de aplicativo", categoria: "Transporte", escopo: "compartilhado", termos: ["cabify"] },
  { nome: "inDrive", oque: "Corrida de aplicativo", categoria: "Transporte", escopo: "compartilhado", termos: ["indrive", "in drive"] },
  { nome: "Shell", oque: "Combustível", categoria: "Transporte", escopo: "compartilhado", termos: ["shell", "shell box", "raizen"] },
  { nome: "Ipiranga", oque: "Combustível", categoria: "Transporte", escopo: "compartilhado", termos: ["ipiranga", "posto ipiranga"] },
  { nome: "Petrobras", oque: "Combustível", categoria: "Transporte", escopo: "compartilhado", termos: ["petrobras", "br mania", "posto br"] },
  { nome: "Posto de combustível", oque: "Combustível", categoria: "Transporte", escopo: "compartilhado", termos: ["posto", "auto posto", "combustivel", "gasolina", "etanol", "alcool"] },
  { nome: "Sem Parar", oque: "Pedágio / Estacionamento", categoria: "Transporte", escopo: "compartilhado", termos: ["sem parar", "semparar"] },
  { nome: "ConectCar", oque: "Pedágio / Estacionamento", categoria: "Transporte", escopo: "compartilhado", termos: ["conectcar", "veloe"] },
  { nome: "Pedágio", oque: "Pedágio", categoria: "Transporte", escopo: "compartilhado", termos: ["pedagio", "ccr", "ecovias", "autoban"] },
  { nome: "Localiza", oque: "Aluguel de carro", categoria: "Transporte", escopo: "compartilhado", termos: ["localiza"] },
  { nome: "Movida", oque: "Aluguel de carro", categoria: "Transporte", escopo: "compartilhado", termos: ["movida"] },
  { nome: "Unidas", oque: "Aluguel de carro", categoria: "Transporte", escopo: "compartilhado", termos: ["unidas", "rentcars", "hertz"] },
  { nome: "ClickBus", oque: "Passagem de ônibus", categoria: "Transporte", escopo: "compartilhado", termos: ["clickbus", "buser", "deonibus"] },

  /* ---- Passagens aéreas ---- */
  { nome: "LATAM", oque: "Passagem aérea", categoria: "Passagens", escopo: "compartilhado", termos: ["latam", "latam airlines", "tam linhas"] },
  { nome: "Azul", oque: "Passagem aérea", categoria: "Passagens", escopo: "compartilhado", termos: ["azul linhas", "voeazul", "azul viagens", "tudoazul"] },
  { nome: "GOL", oque: "Passagem aérea", categoria: "Passagens", escopo: "compartilhado", termos: ["gol linhas", "voegol", "gol transportes", "smiles"] },
  { nome: "Avianca", oque: "Passagem aérea", categoria: "Passagens", escopo: "compartilhado", termos: ["avianca"] },
  { nome: "TAP", oque: "Passagem aérea", categoria: "Passagens", escopo: "compartilhado", termos: ["tap air", "tap portugal"] },
  { nome: "Decolar", oque: "Passagem / Pacote de viagem", categoria: "Passagens", escopo: "compartilhado", termos: ["decolar", "decolar com"] },
  { nome: "123Milhas", oque: "Passagem / Pacote de viagem", categoria: "Passagens", escopo: "compartilhado", termos: ["123milhas", "123 milhas", "maxmilhas"] },
  { nome: "CVC", oque: "Pacote de viagem", categoria: "Passagens", escopo: "compartilhado", termos: ["cvc", "cvc viagens"] },

  /* ---- Hospedagem ---- */
  { nome: "Airbnb", oque: "Hospedagem", categoria: "Hospedagem", escopo: "compartilhado", termos: ["airbnb"] },
  { nome: "Booking.com", oque: "Hospedagem", categoria: "Hospedagem", escopo: "compartilhado", termos: ["booking", "booking com"] },
  { nome: "Hotel Urbano / Hurb", oque: "Hospedagem", categoria: "Hospedagem", escopo: "compartilhado", termos: ["hurb", "hotel urbano"] },
  { nome: "Accor", oque: "Hospedagem", categoria: "Hospedagem", escopo: "compartilhado", termos: ["accor", "ibis", "mercure", "novotel"] },
  { nome: "Hospedagem", oque: "Hospedagem", categoria: "Hospedagem", escopo: "compartilhado", termos: ["hotel", "pousada", "resort", "hostel", "hospedagem", "flat", "chale"] },

  /* ---- Compras / varejo / marketplaces ---- */
  { nome: "Amazon", oque: "Compra online", categoria: "Compras", escopo: "pessoal_privado", termos: ["amazon", "amzn", "amazon br", "amazon prime"] },
  { nome: "Mercado Livre", oque: "Compra online", categoria: "Compras", escopo: "pessoal_privado", termos: ["mercado livre", "mercadolivre", "mercadolibre", "meli"] },
  { nome: "Mercado Pago", oque: "Carteira digital / Compra", categoria: "Compras", escopo: "pessoal_privado", termos: ["mercado pago", "mercadopago"] },
  { nome: "Shopee", oque: "Compra online", categoria: "Compras", escopo: "pessoal_privado", termos: ["shopee"] },
  { nome: "AliExpress", oque: "Compra online", categoria: "Compras", escopo: "pessoal_privado", termos: ["aliexpress", "ali express", "alibaba"] },
  { nome: "Magazine Luiza", oque: "Compra no varejo", categoria: "Compras", escopo: "pessoal_privado", termos: ["magazine luiza", "magalu", "magazineluiza"] },
  { nome: "Americanas", oque: "Compra no varejo", categoria: "Compras", escopo: "pessoal_privado", termos: ["americanas", "lojas americanas", "submarino"] },
  { nome: "Casas Bahia", oque: "Compra no varejo", categoria: "Compras", escopo: "pessoal_privado", termos: ["casas bahia", "casasbahia", "pontofrio", "ponto frio"] },
  { nome: "Renner", oque: "Vestuário", categoria: "Compras", escopo: "pessoal_privado", termos: ["renner", "lojas renner"] },
  { nome: "Riachuelo", oque: "Vestuário", categoria: "Compras", escopo: "pessoal_privado", termos: ["riachuelo"] },
  { nome: "C&A", oque: "Vestuário", categoria: "Compras", escopo: "pessoal_privado", termos: ["c a modas", "cea"] },
  { nome: "Zara", oque: "Vestuário", categoria: "Compras", escopo: "pessoal_privado", termos: ["zara"] },
  { nome: "Centauro", oque: "Artigos esportivos", categoria: "Compras", escopo: "pessoal_privado", termos: ["centauro", "nike", "adidas", "decathlon"] },
  { nome: "Kabum", oque: "Eletrônicos", categoria: "Compras", escopo: "pessoal_privado", termos: ["kabum", "pichau", "terabyte"] },
  { nome: "Apple", oque: "Eletrônicos / App Store", categoria: "Compras", escopo: "pessoal_privado", termos: ["apple", "apple com", "apple store"] },
  { nome: "Samsung", oque: "Eletrônicos", categoria: "Compras", escopo: "pessoal_privado", termos: ["samsung"] },
  { nome: "Leroy Merlin", oque: "Casa e construção", categoria: "Compras", escopo: "pessoal_privado", termos: ["leroy merlin", "leroy"] },

  /* ---- Lazer & Passeios ---- */
  { nome: "Sympla", oque: "Ingresso / Evento", categoria: "Lazer & Passeios", escopo: "compartilhado", termos: ["sympla"] },
  { nome: "Eventim", oque: "Ingresso / Evento", categoria: "Lazer & Passeios", escopo: "compartilhado", termos: ["eventim", "ticketmaster", "ingresso rapido", "ingresso com"] },
  { nome: "Cinemark", oque: "Cinema", categoria: "Lazer & Passeios", escopo: "compartilhado", termos: ["cinemark", "cinepolis", "kinoplex", "uci"] },
  { nome: "Passeio turístico", oque: "Passeio / Atração", categoria: "Lazer & Passeios", escopo: "compartilhado", termos: ["ingresso", "parque", "tour", "passeio", "museu", "show", "aquario", "bondinho", "teleferico", "escuna", "mergulho"] },

  /* ---- Assinaturas / streaming / serviços ---- */
  { nome: "Netflix", oque: "Assinatura de streaming", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["netflix"] },
  { nome: "Spotify", oque: "Assinatura de música", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["spotify"] },
  { nome: "Amazon Prime", oque: "Assinatura de streaming", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["prime video", "amazon prime"] },
  { nome: "Disney+", oque: "Assinatura de streaming", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["disney plus", "disney", "star plus"] },
  { nome: "HBO Max", oque: "Assinatura de streaming", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["hbo max", "max", "hbomax"] },
  { nome: "YouTube Premium", oque: "Assinatura de streaming", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["youtube premium", "google youtube"] },
  { nome: "Google", oque: "Serviço / Assinatura", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["google", "google one", "google storage", "google play"] },
  { nome: "Microsoft", oque: "Serviço / Assinatura", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["microsoft", "office 365", "xbox"] },
  { nome: "iCloud", oque: "Serviço / Assinatura", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["icloud", "apple icloud"] },
  { nome: "ChatGPT / OpenAI", oque: "Serviço / Assinatura", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["openai", "chatgpt"] },
  { nome: "Academia", oque: "Mensalidade de academia", categoria: "Assinaturas", escopo: "pessoal_privado", termos: ["academia", "smart fit", "smartfit", "bodytech", "bio ritmo"] },

  /* ---- Saúde & Farmácia ---- */
  { nome: "Drogasil", oque: "Farmácia", categoria: "Saúde & Farmácia", escopo: "pessoal_privado", termos: ["drogasil"] },
  { nome: "Droga Raia", oque: "Farmácia", categoria: "Saúde & Farmácia", escopo: "pessoal_privado", termos: ["droga raia", "drogaraia", "raia"] },
  { nome: "Pacheco", oque: "Farmácia", categoria: "Saúde & Farmácia", escopo: "pessoal_privado", termos: ["drogaria pacheco", "pacheco"] },
  { nome: "Pague Menos", oque: "Farmácia", categoria: "Saúde & Farmácia", escopo: "pessoal_privado", termos: ["pague menos", "paguemenos", "extrafarma"] },
  { nome: "Farmácia", oque: "Farmácia", categoria: "Saúde & Farmácia", escopo: "pessoal_privado", termos: ["farmacia", "drogaria", "panvel", "nissei", "ultrafarma"] },
  { nome: "Plano de saúde", oque: "Saúde", categoria: "Saúde & Farmácia", escopo: "pessoal_privado", termos: ["plano de saude", "unimed", "amil", "hapvida", "sulamerica saude", "consulta", "laboratorio", "exame"] },

  /* ---- Taxas & Impostos ---- */
  { nome: "IOF", oque: "IOF / Taxa bancária", categoria: "Taxas & Impostos", escopo: "compartilhado", termos: ["iof"] },
  { nome: "Anuidade do cartão", oque: "Taxa bancária", categoria: "Taxas & Impostos", escopo: "pessoal_privado", termos: ["anuidade", "tarifa", "tarifas", "taxa", "juros", "encargos", "multa"] },
  { nome: "Seguro", oque: "Seguro", categoria: "Taxas & Impostos", escopo: "pessoal_privado", termos: ["seguro", "seguros", "prestamista"] },
];

const DICIONARIO_NORMALIZADO = DICIONARIO.map((e) => ({
  ...e,
  termos: e.termos.map(normalizar),
}));

/** Enriquecimento semântico 100% local (fallback que nunca falha). */
export function enriquecerPeloDicionario(
  descricaoOriginal: string,
  cleanMerchantName: string
): {
  cleanMerchantName: string;
  whatWasBought: string;
  category: CategoriaDuoFinance;
  categoryIcon: string;
  suggestedScope: EscopoSugerido;
} {
  const alvo = normalizar(`${descricaoOriginal} ${cleanMerchantName}`);
  for (const entrada of DICIONARIO_NORMALIZADO) {
    if (entrada.termos.some((t) => alvo.includes(t))) {
      return {
        cleanMerchantName: entrada.nome,
        whatWasBought: entrada.oque,
        category: entrada.categoria,
        categoryIcon: ICONE_POR_CATEGORIA[entrada.categoria],
        suggestedScope: entrada.escopo,
      };
    }
  }
  // Sem correspondência: mantém o nome limpo e usa o padrão seguro (privado).
  return {
    cleanMerchantName,
    whatWasBought: "Compra",
    category: "Outros",
    categoryIcon: ICONE_POR_CATEGORIA["Outros"],
    suggestedScope: "pessoal_privado",
  };
}

/* ======================================================================== */
/* Pipeline determinístico                                                  */
/* ======================================================================== */

/** Mês de referência da fatura: o AAAA-MM mais frequente entre as compras. */
function referenciaDaFatura(datas: string[]): string {
  if (datas.length === 0) return "";
  const contagem = new Map<string, number>();
  for (const iso of datas) {
    const mes = iso.slice(0, 7);
    contagem.set(mes, (contagem.get(mes) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Analisa uma fatura (CSV/TXT/texto colado) em transações ricas, SEM IA.
 * Faz toda a etapa determinística: parsing, separação de pagamentos/estornos,
 * detecção de parcelas e enriquecimento pelo dicionário local.
 *
 * A Server Action de IA pode, depois, sobrescrever os campos semânticos
 * (cleanMerchantName/whatWasBought/category/suggestedScope) com a saída do
 * Gemini quando ele estiver configurado.
 */
export function analisarFatura(texto: string, hojeIso: string): ResultadoAnaliseFatura {
  const { itens, ignoradas, formato } = importarExtrato(texto, hojeIso);

  const transacoes: TransacaoAnalisada[] = itens.map((item) => {
    const installmentInfo = detectarParcela(item.titulo, item.valor);
    const cleanMerchantName = limparNomeEstabelecimento(item.titulo);
    const semantico = enriquecerPeloDicionario(item.titulo, cleanMerchantName);
    return {
      id: `linha-${item.linha}`,
      linha: item.linha,
      dataIso: item.dataIso,
      dataBR: isoToBR(item.dataIso),
      descricaoOriginal: item.titulo,
      valor: item.valor,
      moeda: "BRL",
      cleanMerchantName: semantico.cleanMerchantName,
      whatWasBought: semantico.whatWasBought,
      category: semantico.category,
      categoryIcon: semantico.categoryIcon,
      suggestedScope: semantico.suggestedScope,
      installmentInfo,
      ignorarNoCalculo: false,
      fonteEnriquecimento: "dicionario",
    };
  });

  return {
    transacoes,
    ignoradas,
    formato,
    faturaReferencia: referenciaDaFatura(transacoes.map((t) => t.dataIso)),
  };
}

/* ======================================================================== */
/* Agregados para o "Raio-X da Fatura"                                      */
/* ======================================================================== */

export interface ResumoCategoria {
  category: CategoriaDuoFinance;
  icon: string;
  total: number;
  /** % do total de gastos desta fatura. */
  percentual: number;
  quantidade: number;
}

export interface RaioXFatura {
  /** Soma líquida de gastos (parcelas deste mês + à vista), sem ignorados. */
  totalFatura: number;
  /** Total e quantidade de compras à vista (não parceladas). */
  totalAVista: number;
  qtdAVista: number;
  percentualAVista: number;
  /** Total das parcelas deste mês + quantidade de itens parcelados. */
  totalParceladoMes: number;
  qtdParcelada: number;
  /** Soma de todas as parcelas que ainda vão vencer. */
  comprometimentoFuturo: number;
  porCategoria: ResumoCategoria[];
}

export function calcularRaioX(transacoes: TransacaoAnalisada[]): RaioXFatura {
  const ativas = transacoes.filter((t) => !t.ignorarNoCalculo);
  const totalFatura = ativas.reduce((a, t) => a + t.valor, 0);

  const aVista = ativas.filter((t) => !t.installmentInfo.isInstallment);
  const parceladas = ativas.filter((t) => t.installmentInfo.isInstallment);

  const totalAVista = aVista.reduce((a, t) => a + t.valor, 0);
  const totalParceladoMes = parceladas.reduce((a, t) => a + t.valor, 0);
  const comprometimentoFuturo = parceladas.reduce((a, t) => a + t.installmentInfo.remainingAmount, 0);

  const mapa = new Map<CategoriaDuoFinance, { total: number; quantidade: number }>();
  for (const t of ativas) {
    const atual = mapa.get(t.category) ?? { total: 0, quantidade: 0 };
    atual.total += t.valor;
    atual.quantidade += 1;
    mapa.set(t.category, atual);
  }
  const porCategoria: ResumoCategoria[] = [...mapa.entries()]
    .map(([category, { total, quantidade }]) => ({
      category,
      icon: ICONE_POR_CATEGORIA[category],
      total: Math.round(total * 100) / 100,
      percentual: totalFatura > 0 ? Math.round((total / totalFatura) * 1000) / 10 : 0,
      quantidade,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalFatura: Math.round(totalFatura * 100) / 100,
    totalAVista: Math.round(totalAVista * 100) / 100,
    qtdAVista: aVista.length,
    percentualAVista: totalFatura > 0 ? Math.round((totalAVista / totalFatura) * 1000) / 10 : 0,
    totalParceladoMes: Math.round(totalParceladoMes * 100) / 100,
    qtdParcelada: parceladas.length,
    comprometimentoFuturo: Math.round(comprometimentoFuturo * 100) / 100,
    porCategoria,
  };
}

/* ======================================================================== */
/* Mesclagem do enriquecimento (IA ou dicionário) de volta nas transações   */
/* ======================================================================== */

/** Campos semânticos que a IA (ou o dicionário) preenche por transação. */
export interface EnriquecimentoSemantico {
  id: string;
  cleanMerchantName: string;
  whatWasBought: string;
  category: CategoriaDuoFinance;
  categoryIcon: string;
  suggestedScope: EscopoSugerido;
}

/**
 * Aplica o enriquecimento (vindo da Server Action, IA ou dicionário) de volta
 * nas transações completas. Puro: não depende do servidor, usado no cliente
 * após a resposta da action.
 */
export function mesclarEnriquecimento(
  transacoes: TransacaoAnalisada[],
  enriquecimento: EnriquecimentoSemantico[],
  fonte: "ia" | "dicionario"
): TransacaoAnalisada[] {
  const porId = new Map(enriquecimento.map((e) => [e.id, e]));
  return transacoes.map((t) => {
    const e = porId.get(t.id);
    if (!e) return t;
    return {
      ...t,
      cleanMerchantName: e.cleanMerchantName,
      whatWasBought: e.whatWasBought,
      category: e.category,
      categoryIcon: e.categoryIcon,
      suggestedScope: e.suggestedScope,
      fonteEnriquecimento: fonte,
    };
  });
}

/* ======================================================================== */
/* Ponte com o modelo sincronizado (Categoria / Escopo de despesas_viagem)  */
/* ======================================================================== */

import type { Categoria, Escopo } from "./classificar";

/** Mapeia a categoria rica do DuoFinance para a categoria do store atual. */
export function categoriaParaStore(c: CategoriaDuoFinance): Categoria {
  switch (c) {
    case "Alimentação":
      return "Alimentação & Gastronomia";
    case "Transporte":
    case "Passagens":
      return "Passagens & Transporte";
    case "Hospedagem":
      return "Hospedagem";
    case "Lazer & Passeios":
      return "Passeios & Lazer";
    // Compras, Assinaturas, Saúde & Farmácia, Taxas & Impostos e Outros
    // não têm categoria de viagem equivalente: viram gasto pessoal.
    default:
      return "Gasto Pessoal (Fora da Viagem)";
  }
}

/** Mapeia o escopo sugerido do DuoFinance para o escopo do store. */
export function escopoParaStore(e: EscopoSugerido): Escopo {
  return e === "compartilhado" ? "viagem_compartilhado" : "pessoal_privado";
}
