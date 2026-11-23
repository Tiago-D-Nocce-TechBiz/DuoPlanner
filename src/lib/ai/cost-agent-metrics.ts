import { addDays, daysBetween } from "@/lib/dates";

/**
 * Métricas de custo do casal para a Nora ("agente de gestão de custos").
 *
 * Tudo aqui é aritmética determinística em CENTAVOS inteiros: a IA não soma,
 * não divide nem compara valores. Ela recebe estes números prontos (e a tela
 * os mostra direto) e só os interpreta. Puro e sem dependências de servidor:
 * roda no servidor (contexto da Nora) e no navegador (cálculo offline com os
 * dados do aparelho).
 *
 * Escopo: só gastos COMPARTILHADOS do casal (`viagem_compartilhado`). Quem
 * monta a entrada é o responsável por nunca incluir gasto pessoal privado;
 * este módulo só vê centavos, categoria e datas.
 *
 * Arredondamento: a média diária é o total dividido pelos dias, arredondado ao
 * centavo (metade para cima). Percentuais saem em décimos de ponto percentual
 * (permil, inteiro): 625 = 62,5%. Só as razões usadas como limiar de alerta
 * (ritmo e parcelas) são comparadas em ponto flutuante, nunca valores gravados.
 */

/* ---------------------------------- tipos ---------------------------------- */

export type GravidadeDeCusto = "info" | "atencao" | "critico";

export type IdDoSinal =
  | "concentracao_categoria"
  | "ritmo_acelerado"
  | "parcelas_comprometem"
  | "roteiro_a_lancar"
  | "sem_cotacao"
  | "dados_truncados";

export interface SinalDeCusto {
  id: IdDoSinal;
  gravidade: GravidadeDeCusto;
  titulo: string;
  /** Texto pronto em PT-BR, já com os valores. */
  detalhe: string;
}

export interface CategoriaDeCusto {
  categoria: string;
  centavos: number;
  quantidade: number;
  /** Décimos de ponto percentual do total (625 = 62,5%). */
  permil: number;
}

export interface ResumoDeCustos {
  quantidade: number;
  totalCentavos: number;
  /** Do primeiro ao último lançamento, inclusive; null sem lançamentos datados. */
  periodo: { inicio: string; fim: string; dias: number } | null;
  diasComGasto: number;
  /** Total ÷ dias do período, ao centavo. */
  mediaDiariaCentavos: number;
  porCategoria: CategoriaDeCusto[];
  ultimos7Dias: { totalCentavos: number; mediaDiariaCentavos: number };
  /** Parcelas de cartão que ainda vão ser cobradas (compartilhadas). */
  parcelas: { compras: number; abertas: number; restantesCentavos: number };
  /** Custos estimados do Roteiro e quanto deles ainda não virou gasto. */
  roteiro: { itensComCusto: number; estimadoCentavos: number; lancadoCentavos: number; aLancarCentavos: number };
  /** Gasto + parcelas restantes + custos do Roteiro ainda não lançados. */
  previsaoCentavos: number;
  /** Gastos em moeda estrangeira sem cotação: ficaram fora dos totais. */
  semCotacao: number;
  /** A leitura bateu no teto de lançamentos: os mais antigos ficaram de fora. */
  truncado: boolean;
  sinais: SinalDeCusto[];
}

/** Um gasto compartilhado já em reais (centavos). */
export interface GastoParaCusto {
  centavos: number;
  categoria: string;
  /** AAAA-MM-DD */
  dia: string | null;
  parcelaAtual: number | null;
  totalParcelas: number | null;
  /** Identifica a compra parcelada (ver `chaveDaCompraParcelada`); null = cada linha é uma compra. */
  compra: string | null;
}

export interface ItemDeRoteiroParaCusto {
  custoCentavos: number;
  /** Já virou gasto nas Finanças (compartilhado). */
  lancado: boolean;
}

export interface EntradaDeCustos {
  gastos: readonly GastoParaCusto[];
  roteiro: readonly ItemDeRoteiroParaCusto[];
  semCotacao: number;
  truncado: boolean;
  /** "Hoje" (AAAA-MM-DD): o cálculo não lê o relógio. */
  hojeIso: string;
}

/* ------------------------------- limiares -------------------------------- */

/**
 * Quando um número vira alerta. Valores em centavos ou em décimos de ponto
 * percentual (permil); as razões são adimensionais. Mudar um limiar é mudar
 * a regra do produto: os testes mostram o comportamento nas fronteiras.
 */
export const LIMIARES_DE_CUSTO = {
  /** Uma categoria com tanto do total chama atenção (60%) ou é crítica (80%)... */
  concentracaoAtencaoPermil: 600,
  concentracaoCriticoPermil: 800,
  /** ...mas só com gasto suficiente para a proporção significar algo. */
  concentracaoMinimoCentavos: 30_000,
  concentracaoMinimoLancamentos: 3,
  /** Ritmo: média diária dos últimos 7 dias contra a média diária anterior. */
  ritmoJanelaDias: 7,
  ritmoAtencaoRazao: 1.5,
  ritmoCriticoRazao: 2.5,
  ritmoMinimoRecenteCentavos: 20_000,
  ritmoMinimoDiasDeBase: 7,
  /** Parcelas restantes contra o que já foi gasto: 50% atenção, 100% crítico. */
  parcelasAtencaoRazao: 0.5,
  parcelasCriticoRazao: 1,
  parcelasMinimoCentavos: 30_000,
} as const;

/* ------------------------------ formatação ------------------------------- */

const FORMATO_REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 1.234,56" (espaço comum, não o inseparável do Intl). */
export function reais(centavos: number): string {
  return FORMATO_REAIS.format(centavos / 100).replace(/\u00a0/g, " ");
}

/** 625 → "62,5%". */
export function percentualTexto(permil: number): string {
  return `${(permil / 10).toFixed(1).replace(".", ",")}%`;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/* ---------------------------- compras parceladas --------------------------- */

/**
 * Chave de uma compra parcelada: a mesma compra aparece em várias faturas
 * (parcela 3/10 em outubro, 4/10 em novembro). Descrição sem o "3/10",
 * sem acento e minúscula, mais o valor da parcela e o total de parcelas.
 */
export function chaveDaCompraParcelada(descricao: string, centavos: number, totalParcelas: number): string {
  const nome = descricao
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bparc(?:ela)?\s*\d{1,2}\s*(?:\/|\s+de\s+)\s*\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${nome}|${centavos}|${totalParcelas}`;
}

/* -------------------------------- cálculo -------------------------------- */

const ORDEM_DA_GRAVIDADE: Record<GravidadeDeCusto, number> = { critico: 0, atencao: 1, info: 2 };

export const CUSTOS_VAZIOS: ResumoDeCustos = {
  quantidade: 0,
  totalCentavos: 0,
  periodo: null,
  diasComGasto: 0,
  mediaDiariaCentavos: 0,
  porCategoria: [],
  ultimos7Dias: { totalCentavos: 0, mediaDiariaCentavos: 0 },
  parcelas: { compras: 0, abertas: 0, restantesCentavos: 0 },
  roteiro: { itensComCusto: 0, estimadoCentavos: 0, lancadoCentavos: 0, aLancarCentavos: 0 },
  previsaoCentavos: 0,
  semCotacao: 0,
  truncado: false,
  sinais: [],
};

/** Há algo para analisar: gastos compartilhados ou custos estimados no Roteiro? */
export function temDadosDeCusto(c: ResumoDeCustos): boolean {
  return c.quantidade > 0 || c.roteiro.estimadoCentavos > 0;
}

const centavosValidos = (n: number) => Number.isSafeInteger(n) && n > 0;

export function calcularCustos(entrada: EntradaDeCustos): ResumoDeCustos {
  const L = LIMIARES_DE_CUSTO;
  const gastos = entrada.gastos.filter((g) => centavosValidos(g.centavos));

  /* total, período e média */
  let total = 0;
  const dias = new Set<string>();
  let inicio: string | null = null;
  let fim: string | null = null;
  const porCat = new Map<string, { centavos: number; quantidade: number }>();
  for (const g of gastos) {
    total += g.centavos;
    const cat = porCat.get(g.categoria);
    if (cat) {
      cat.centavos += g.centavos;
      cat.quantidade += 1;
    } else porCat.set(g.categoria, { centavos: g.centavos, quantidade: 1 });
    if (g.dia && DATA_ISO.test(g.dia)) {
      dias.add(g.dia);
      if (inicio === null || g.dia < inicio) inicio = g.dia;
      if (fim === null || g.dia > fim) fim = g.dia;
    }
  }
  const periodo = inicio !== null && fim !== null ? { inicio, fim, dias: daysBetween(inicio, fim) + 1 } : null;
  const mediaDiariaCentavos = periodo ? Math.round(total / periodo.dias) : 0;

  const porCategoria: CategoriaDeCusto[] = [...porCat.entries()]
    .map(([categoria, v]) => ({ categoria, centavos: v.centavos, quantidade: v.quantidade, permil: total > 0 ? Math.round((v.centavos * 1000) / total) : 0 }))
    .sort((a, b) => b.centavos - a.centavos || (a.categoria < b.categoria ? -1 : a.categoria > b.categoria ? 1 : 0));

  /* últimos 7 dias × o período anterior */
  const inicioDaJanela = addDays(entrada.hojeIso, -(L.ritmoJanelaDias - 1));
  let recente = 0;
  let base = 0;
  let inicioDaBase: string | null = null;
  for (const g of gastos) {
    if (!g.dia || !DATA_ISO.test(g.dia) || g.dia > entrada.hojeIso) continue;
    if (g.dia >= inicioDaJanela) recente += g.centavos;
    else {
      base += g.centavos;
      if (inicioDaBase === null || g.dia < inicioDaBase) inicioDaBase = g.dia;
    }
  }
  const diasDaBase = inicioDaBase ? daysBetween(inicioDaBase, addDays(entrada.hojeIso, -L.ritmoJanelaDias)) + 1 : 0;

  /* parcelas restantes (uma vez por compra: vale a parcela mais recente) */
  const maisRecente = new Map<string, GastoParaCusto>();
  gastos.forEach((g, i) => {
    const { parcelaAtual: atual, totalParcelas: totalParc } = g;
    if (atual === null || totalParc === null || totalParc < 2 || atual < 1 || atual > totalParc) return;
    const chave = g.compra ?? `#${i}`;
    const anterior = maisRecente.get(chave);
    if (!anterior || (anterior.parcelaAtual ?? 0) < atual) maisRecente.set(chave, g);
  });
  let parcelasAbertas = 0;
  let parcelasCompras = 0;
  let restantes = 0;
  for (const g of maisRecente.values()) {
    const faltam = (g.totalParcelas ?? 0) - (g.parcelaAtual ?? 0);
    if (faltam <= 0) continue;
    parcelasCompras++;
    parcelasAbertas += faltam;
    restantes += g.centavos * faltam;
  }

  /* Roteiro */
  let estimado = 0;
  let lancado = 0;
  let itensComCusto = 0;
  for (const r of entrada.roteiro) {
    if (!centavosValidos(r.custoCentavos)) continue;
    itensComCusto++;
    estimado += r.custoCentavos;
    if (r.lancado) lancado += r.custoCentavos;
  }
  const aLancar = estimado - lancado;

  const resumo: ResumoDeCustos = {
    quantidade: gastos.length,
    totalCentavos: total,
    periodo,
    diasComGasto: dias.size,
    mediaDiariaCentavos,
    porCategoria,
    ultimos7Dias: { totalCentavos: recente, mediaDiariaCentavos: Math.round(recente / L.ritmoJanelaDias) },
    parcelas: { compras: parcelasCompras, abertas: parcelasAbertas, restantesCentavos: restantes },
    roteiro: { itensComCusto, estimadoCentavos: estimado, lancadoCentavos: lancado, aLancarCentavos: aLancar },
    previsaoCentavos: total + restantes + aLancar,
    semCotacao: Math.max(0, Math.trunc(entrada.semCotacao)),
    truncado: entrada.truncado,
    sinais: [],
  };

  /* sinais objetivos */
  const sinais: SinalDeCusto[] = [];

  const topo = porCategoria[0];
  if (topo && porCategoria.length >= 2 && total >= L.concentracaoMinimoCentavos && gastos.length >= L.concentracaoMinimoLancamentos && topo.permil >= L.concentracaoAtencaoPermil) {
    sinais.push({
      id: "concentracao_categoria",
      gravidade: topo.permil >= L.concentracaoCriticoPermil ? "critico" : "atencao",
      titulo: `Gastos concentrados em ${topo.categoria}`,
      detalhe: `${percentualTexto(topo.permil)} do que já foi gasto (${reais(topo.centavos)} de ${reais(total)}) está em ${topo.categoria}.`,
    });
  }

  if (recente >= L.ritmoMinimoRecenteCentavos && base > 0 && diasDaBase >= L.ritmoMinimoDiasDeBase) {
    const mediaRecente = recente / L.ritmoJanelaDias;
    const mediaBase = base / diasDaBase;
    const razao = mediaRecente / mediaBase;
    if (razao >= L.ritmoAtencaoRazao) {
      sinais.push({
        id: "ritmo_acelerado",
        gravidade: razao >= L.ritmoCriticoRazao ? "critico" : "atencao",
        titulo: "Ritmo de gasto acelerado",
        detalhe: `Nos últimos ${L.ritmoJanelaDias} dias a média foi de ${reais(Math.round(mediaRecente))} por dia, ${razao.toFixed(1).replace(".", ",")} vezes a média anterior de ${reais(Math.round(mediaBase))} por dia.`,
      });
    }
  }

  if (restantes >= L.parcelasMinimoCentavos && total > 0) {
    const razao = restantes / total;
    if (razao >= L.parcelasAtencaoRazao) {
      sinais.push({
        id: "parcelas_comprometem",
        gravidade: razao >= L.parcelasCriticoRazao ? "critico" : "atencao",
        titulo: "Parcelas já comprometem o orçamento",
        detalhe: `Ainda restam ${reais(restantes)} em ${parcelasAbertas} ${parcelasAbertas === 1 ? "parcela" : "parcelas"} de ${parcelasCompras} ${parcelasCompras === 1 ? "compra" : "compras"} no cartão, o equivalente a ${percentualTexto(Math.round(razao * 1000))} do que já foi gasto.`,
      });
    }
  }

  if (aLancar > 0) {
    sinais.push({
      id: "roteiro_a_lancar",
      gravidade: "info",
      titulo: "Custos do Roteiro ainda não lançados",
      detalhe: `O Roteiro estima ${reais(aLancar)} em atividades que ainda não viraram gasto. Com o que já foi gasto e as parcelas, a previsão comprometida é de ${reais(resumo.previsaoCentavos)}.`,
    });
  }

  if (resumo.semCotacao > 0) {
    sinais.push({
      id: "sem_cotacao",
      gravidade: "atencao",
      titulo: "Gastos em moeda estrangeira fora da conta",
      detalhe: `${resumo.semCotacao} ${resumo.semCotacao === 1 ? "lançamento sem cotação ficou" : "lançamentos sem cotação ficaram"} de fora dos totais. Informe a cotação para incluí-${resumo.semCotacao === 1 ? "lo" : "los"}.`,
    });
  }

  if (resumo.truncado) {
    sinais.push({
      id: "dados_truncados",
      gravidade: "info",
      titulo: "Só os lançamentos mais recentes entraram",
      detalhe: "O casal tem mais lançamentos do que a análise lê de uma vez: os mais antigos ficaram de fora dos totais.",
    });
  }

  resumo.sinais = sinais.sort((a, b) => ORDEM_DA_GRAVIDADE[a.gravidade] - ORDEM_DA_GRAVIDADE[b.gravidade]);
  return resumo;
}

/* --------------------- conferência de valores em texto livre --------------------- */

const VALOR_EM_REAIS = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/g;

/** Todos os valores "R$ 1.234,56" de um texto, em centavos. */
export function valoresEmReaisDoTexto(texto: string): number[] {
  const achados: number[] = [];
  for (const m of texto.matchAll(VALOR_EM_REAIS)) {
    const inteiro = Number(m[1].replace(/\./g, ""));
    const cents = m[2] === undefined ? 0 : Number(m[2].padEnd(2, "0"));
    achados.push(inteiro * 100 + cents);
  }
  return achados;
}

/**
 * Todo valor em reais do texto existe entre os `permitidos`? É a defesa contra
 * o modelo "calcular" por conta própria: se o texto cita um valor que o app
 * não calculou, o texto não vale. Texto sem valor nenhum sempre vale.
 */
export function soCitaValoresConhecidos(texto: string, permitidos: ReadonlySet<number>): boolean {
  return valoresEmReaisDoTexto(texto).every((v) => permitidos.has(v));
}
