"use client";

/**
 * Cérebro da Nora — Motor de Intenções Local (determinístico, client-side).
 *
 * Nunca falha nem depende de chave de LLM externa: interpreta a mensagem do
 * usuário, classifica a intenção (passagens/hospedagem, finanças, ajuda do
 * sistema ou conversa) e devolve uma resposta estruturada com texto + ações
 * (cards de links, confirmação de lançamento financeiro, resumo, atalhos).
 *
 * Reusa os motores existentes: concierge (NL → campos), deep-links (URLs
 * pré-preenchidas), datas e o store de finanças.
 */

import {
  interpretarBusca,
  inferirIntencao,
  iataDaCidade,
  type ConciergeParse,
} from "@/lib/concierge";
import {
  buildFlightLinks,
  buildBusLinks,
  buildStayLinks,
  type ProviderLink,
} from "@/lib/deep-links";
import { todayInSaoPaulo, addDays, monthLabel, isoToBR } from "@/lib/dates";
import {
  resumirDespesas,
  classificarItemAutomaticamente,
  type Escopo,
  type ItemDespesa,
} from "@/lib/finance/store";
import { parseValorMonetario } from "@/lib/finance/importar";

export type StatusProposta = "pendente" | "confirmada" | "descartada";

/** Ação anexada à resposta da Nora (renderizada como card no chat). */
export type NoraAcao =
  | {
      tipo: "links";
      intencao: "passagens" | "hospedagem";
      dados: ConciergeParse;
      periodo: { depart: string; retorno: string };
      grupos: { titulo: string; icone: GrupoIcone; links: ProviderLink[] }[];
      preencherModo: "passagens" | "hospedagem";
    }
  // A Nora nunca grava sozinha: propõe o gasto e o usuário confirma no card.
  | { tipo: "proposta_despesa"; item: ItemDespesa; status: StatusProposta }
  | {
      tipo: "resumo";
      totalCompartilhado: number;
      metade: number;
      totalPrivado: number;
      porCategoria: { categoria: string; total: number }[];
    }
  | { tipo: "atalho"; rotulo: string; href?: string; acaoId?: AtalhoId };

export type GrupoIcone = "voos" | "onibus" | "hospedagem";
export type AtalhoId = "convite" | "triagem" | "roteiro";

export interface NoraResposta {
  texto: string;
  acoes: NoraAcao[];
}

export interface NoraContexto {
  nomeUsuario?: string;
  cidadeBase?: string;
  iataBase?: string;
  /** "Hoje" em AAAA-MM-DD (padrão: fuso de São Paulo). Fixado nos testes. */
  hojeIso?: string;
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Escolhe uma variação de frase de forma estável a partir da entrada (dá a
 *  sensação de variedade sem aleatoriedade que quebraria testes). */
function escolher(opcoes: string[], semente: string): string {
  let h = 0;
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) >>> 0;
  return opcoes[h % opcoes.length];
}

/** Recomendação de agente de viagens conforme intenção/destino/datas. */
function recomendacaoViagem(
  intencao: "passagens" | "hospedagem",
  destino: string,
  temData: boolean
): string {
  const dicas: string[] = [];
  if (intencao === "passagens") {
    dicas.push(
      "Dica: comparar terça e quarta costuma render tarifas mais baixas; se tiverem flexibilidade de datas, vale checar a semana toda."
    );
    if (!temData) dicas.push("Comprar com 4 a 8 semanas de antecedência ajuda no preço.");
  } else {
    dicas.push(
      "Dica: reservas com cancelamento grátis dão margem para ajustar o roteiro depois."
    );
  }
  const d = norm(destino);
  if (["cabo frio", "buzios", "búzios", "arraial"].some((x) => d.includes(x))) {
    dicas.push("Na Região dos Lagos, hospedagem perto do centro ou da praia principal economiza no transporte.");
  }
  // Uma dica só, para não poluir.
  return dicas[0] ?? "";
}

/* -------------------------------- Finanças -------------------------------- */

// Verbos que, colados a um número, indicam dinheiro ("gastei 150").
const VERBOS_COM_VALOR =
  "lance|lanca|lança|lancar|lançar|adicione|adicionar|registre|registrar|anote|anotar|gastei|gastamos|gastou|paguei|pagamos|pagou|custou|custaram|saiu|sairam|saíram";
// Depois desses, o número não é dinheiro ("paguei 2 diárias", "anote 12 de agosto").
const UNIDADES_NAO_MONETARIAS =
  "pessoas?|passageiros?|adultos?|crian[cç]as?|h[oó]spedes?|dias?|noites?|di[aá]rias?|horas?|h|x|vez|vezes|parcelas?|km|kg|quartos?|camas?|anos?|meses|semanas?|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const NUMERO = "(\\d+(?:[.,]\\d+)*)";

const RE_VALOR_RS = new RegExp(`R\\$\\s*${NUMERO}`, "i");
const RE_VALOR_REAIS = new RegExp(`${NUMERO}\\s*(?:reais|real)\\b`, "i");
// Centavos explícitos ("89,90", "1.234,56", "25.90"), sem pegar datas e horas.
const RE_VALOR_CENTAVOS = /(?:^|[^\d/:.,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})(?![\d/:.,])/;
const RE_VALOR_APOS_VERBO = new RegExp(
  `\\b(?:${VERBOS_COM_VALOR})\\s+(?:uns\\s+|umas\\s+|cerca de\\s+|quase\\s+)?(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?![\\d.,/:])(?!\\s*(?:de\\s+)?(?:${UNIDADES_NAO_MONETARIAS})\\b)`,
  "i"
);

/**
 * Extrai um valor em reais da frase. Só conta como dinheiro: "R$ 150",
 * "150 reais", valor com centavos ("89,90") ou número logo após um verbo de
 * gasto ("gastei 150"). "Dia 12" ou "2 pessoas" não são dinheiro.
 */
export function extrairValor(frase: string): number | null {
  const m =
    RE_VALOR_RS.exec(frase) ??
    RE_VALOR_REAIS.exec(frase) ??
    RE_VALOR_CENTAVOS.exec(frase) ??
    RE_VALOR_APOS_VERBO.exec(frase);
  if (!m) return null;
  const v = parseValorMonetario(m[1]);
  return v !== null && v > 0 ? v : null;
}

const RE_PALAVRAS_DE_COMANDO = new RegExp(
  `(^|\\s)(?:${VERBOS_COM_VALOR}|gasto|despesa|de|como|compartilhad[oa]|da viagem|viagem|pessoal|privad[oa]|oculto|meu|minha|uns|umas|cerca de|quase|reais|real)(?=\\s|$|[.,!?])`,
  "gi"
);
const RE_LIGACAO_NAS_PONTAS = /^(?:(?:no|na|nos|nas|em|com|o|a|os|as|um|uma|pro|pra|para|do|da)\s+)+|(?:\s+(?:no|na|nos|nas|em|com|o|a|os|as|pro|pra|para|do|da))+$/i;

/** Título do gasto: remove verbo, valor e escopo e deixa a descrição. */
function extrairTituloGasto(frase: string): string {
  let t = frase
    .replace(/R\$\s*\d+(?:[.,]\d+)*/gi, " ")
    .replace(/\d+(?:[.,]\d+)*/g, " ")
    .replace(/[!?]+/g, " ");
  // Duas passadas: "de" seguido de outra palavra de comando ("como gasto").
  t = t.replace(RE_PALAVRAS_DE_COMANDO, " ").replace(RE_PALAVRAS_DE_COMANDO, " ");
  t = t.replace(/\s+/g, " ").trim().replace(RE_LIGACAO_NAS_PONTAS, "").replace(/[.,;:]+$/, "").trim();
  if (!t) t = "Gasto";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function pareceLancamentoFinanceiro(t: string, frase: string): boolean {
  const temComando = /\b(lance|lanca|lancar|adicione|adicionar|registre|registrar|anote|anotar)\b/.test(t);
  const temVerboDeGasto = /\b(gastei|gastamos|gastou|paguei|pagamos|pagou|custou|custaram|saiu|sairam)\b/.test(t);
  const temValor = extrairValor(frase) !== null;
  const temGasto = /\b(gasto|despesa)\b/.test(t);
  const temEscopo = /(compartilhad|pessoal|privad|da viagem)/.test(t);
  // Casos que indicam lançar um gasto:
  // - comando + (valor OU "gasto/despesa");
  // - verbo de gasto ("gastei", "custou") + valor;
  // - "gasto/despesa" + valor;
  // - valor + escopo explícito ("R$ 150 ... compartilhado/pessoal").
  return (
    (temComando && (temValor || temGasto)) ||
    (temVerboDeGasto && temValor) ||
    (temGasto && temValor) ||
    (temValor && temEscopo)
  );
}

function pareceConsultaFinanceira(t: string): boolean {
  return (
    /\b(quanto|resumo|total|gastamos|gastei|saldo|divis\w*|cada um|metade|50)\b/.test(t) &&
    /\b(gast\w*|viagem|despesas?|contas?|dividir|cada)\b/.test(t)
  );
}

function responderLancamento(frase: string, ctx: NoraContexto): NoraResposta {
  const t = norm(frase);
  const valor = extrairValor(frase);
  if (!valor) {
    return {
      texto: "Entendi que você quer lançar um gasto, mas não identifiquei o valor. Tente algo como: \"Lance R$ 150 de almoço como gasto compartilhado\".",
      acoes: [],
    };
  }
  const titulo = extrairTituloGasto(frase);

  // Escopo explícito pela frase; senão, classifica por palavra-chave.
  let escopo: Escopo | null = null;
  if (/(pessoal|privad|oculto|\bmeu\b|\bminha\b|s[oó] meu)/.test(t)) escopo = "pessoal_privado";
  if (/(compartilhad|da viagem|\bviagem\b|dividir|dupla|juntos)/.test(t)) escopo = "viagem_compartilhado";

  const hoje = ctx.hojeIso ?? todayInSaoPaulo();
  const classificado = classificarItemAutomaticamente(titulo, valor, isoToBR(hoje), "Nora");
  const item: ItemDespesa = { ...classificado, escopo: escopo ?? classificado.escopo };

  const tipo =
    item.escopo === "pessoal_privado"
      ? "gasto pessoal (privado: fica oculto para o parceiro(a) e não entra na divisão)"
      : "gasto compartilhado da viagem (entra na divisão 50/50)";
  return {
    texto: `Confere antes de eu lançar: ${brl(item.valor)} em "${item.estabelecimento}" como ${tipo}. Toque em Confirmar para registrar; se preferir, troque o tipo no cartão.`,
    acoes: [
      { tipo: "proposta_despesa", item, status: "pendente" },
      { tipo: "atalho", rotulo: "Abrir Finanças Duo", href: "/dashboard/financas" },
    ],
  };
}

function responderResumoFinanceiro(): NoraResposta {
  const r = resumirDespesas();
  if (r.qtdCompartilhado === 0 && r.qtdPrivado === 0) {
    return {
      texto: "Ainda não há gastos lançados. Você pode me pedir, por exemplo: \"Lance R$ 150 de almoço como gasto compartilhado\".",
      acoes: [{ tipo: "atalho", rotulo: "Abrir Finanças Duo", href: "/dashboard/financas" }],
    };
  }
  return {
    texto: `Vocês já têm ${brl(r.totalCompartilhado)} em gastos compartilhados da viagem — ${brl(r.metade)} para cada um (divisão 50/50). Seus gastos pessoais privados somam ${brl(r.totalPrivado)} e não entram na divisão.`,
    acoes: [
      {
        tipo: "resumo",
        totalCompartilhado: r.totalCompartilhado,
        metade: r.metade,
        totalPrivado: r.totalPrivado,
        porCategoria: r.porCategoria.map((c) => ({ categoria: c.categoria, total: c.total })),
      },
      { tipo: "atalho", rotulo: "Abrir Finanças Duo", href: "/dashboard/financas" },
    ],
  };
}

/* ------------------------------- Viagem/links ----------------------------- */

function temSinalDeViagem(dados: ConciergeParse): boolean {
  return Boolean(
    dados.destinationCity || dados.destinationIata || dados.originCity || dados.departDate
  );
}

function responderViagem(frase: string, ctx: NoraContexto): NoraResposta {
  const hoje = ctx.hojeIso ?? todayInSaoPaulo();
  const dados = interpretarBusca(frase, hoje);

  // Usa a cidade base do casal como origem quando o usuário não informa.
  if (!dados.originCity && !dados.originIata && ctx.cidadeBase) {
    dados.originCity = ctx.cidadeBase;
    dados.originIata = ctx.iataBase || iataDaCidade(ctx.cidadeBase);
  }

  if (!temSinalDeViagem(dados)) {
    return {
      texto:
        "Vou montar isso com você. Me conta três coisas: para onde querem ir, de onde saem e em quais datas (e quantas pessoas). Por exemplo: \"de Belo Horizonte para Búzios, 08 a 15/07, 2 pessoas\".",
      acoes: [],
    };
  }

  const intencao = inferirIntencao(frase);
  const temDataExplicita = Boolean(dados.departDate);
  const depart = dados.departDate ?? addDays(hoje, 14);
  const retorno = dados.returnDate ?? addDays(depart, 5);
  const pax = Math.max(1, dados.passengers ?? 2);

  const originCity = dados.originCity ?? "";
  const destinationCity = dados.destinationCity ?? "";
  const originIata = (dados.originIata ?? iataDaCidade(originCity) ?? "").toUpperCase();
  const destinationIata = (dados.destinationIata ?? iataDaCidade(destinationCity) ?? "").toUpperCase();

  const grupos: { titulo: string; icone: GrupoIcone; links: ProviderLink[] }[] = [];
  const avisos: string[] = [];

  const voos =
    originIata && destinationIata
      ? buildFlightLinks({
          originCity, destinationCity, originIata, destinationIata,
          departDate: depart, returnDate: retorno, tripType: "round",
          passengers: pax, cabin: "economy",
        })
      : [];
  const onibus =
    originCity && destinationCity
      ? buildBusLinks({ originCity, destinationCity, departDate: depart, returnDate: retorno })
      : [];
  const hospedagem = destinationCity
    ? buildStayLinks({ city: destinationCity, checkin: depart, checkout: retorno, guests: pax, rooms: 1 })
    : [];

  // Aviso de aeroporto próximo (destino sem aeroporto próprio).
  if (destinationCity && !dados.destinationIata && destinationIata) {
    const semAeroporto = ["cabo frio", "buzios", "búzios", "paraty", "angra dos reis"];
    if (semAeroporto.includes(norm(destinationCity))) {
      avisos.push(
        `${destinationCity} não tem aeroporto comercial próprio — usei o mais próximo (${destinationIata}). Considere também GIG/SDU (Rio) conforme o preço.`
      );
    }
  }
  if (!originIata && intencao === "passagens") {
    avisos.push("Para voos, me diga a cidade de origem (ou defina a cidade base nas Configurações).");
  }

  const ordem: GrupoIcone[] = intencao === "hospedagem" ? ["hospedagem", "voos", "onibus"] : ["voos", "onibus", "hospedagem"];
  const rotulo: Record<GrupoIcone, string> = { voos: "Voos", onibus: "Ônibus", hospedagem: "Hospedagem" };
  const mapa: Record<GrupoIcone, ProviderLink[]> = { voos, onibus, hospedagem };
  for (const g of ordem) {
    if (mapa[g].length > 0) grupos.push({ titulo: rotulo[g], icone: g, links: mapa[g] });
  }

  const partes: string[] = [];
  if (originCity) partes.push(`de ${originCity}`);
  if (destinationCity) partes.push(`para ${destinationCity}`);
  const resumoViagem = `${partes.join(" ")} em ${monthLabel(depart)}, ${pax} ${pax > 1 ? "pessoas" : "pessoa"}`;

  // Perguntas de acompanhamento quando falta informação (postura de agente).
  const perguntas: string[] = [];
  if (!temDataExplicita) perguntas.push("Já têm datas em mente? Sugeri um período, mas posso ajustar.");
  if (intencao === "passagens" && !originIata && !originCity)
    perguntas.push("De qual cidade vocês partem?");
  if (!dados.passengers) perguntas.push("A viagem é para quantas pessoas?");

  // Recomendação contextual (postura de agente de viagens).
  const recomendacao = recomendacaoViagem(intencao, destinationCity, temDataExplicita);

  let texto: string;
  if (grupos.length > 0) {
    const aberturas = [
      `Boa! Preparei as opções ${resumoViagem}.`,
      `Separei o que encontrei ${resumoViagem}.`,
      `Aqui vão as opções ${resumoViagem}.`,
    ];
    texto = escolher(aberturas, frase);
    texto += " Toque em um parceiro para abrir a busca já preenchida.";
    if (recomendacao) texto += ` ${recomendacao}`;
    if (avisos.length) texto += ` ${avisos.join(" ")}`;
    if (perguntas.length) texto += ` ${perguntas[0]}`;
  } else {
    texto = `Entendi ${resumoViagem}, mas preciso de um detalhe a mais para montar os links. ${
      [...avisos, ...perguntas].join(" ") || "Pode me dizer a cidade de destino?"
    }`;
  }

  const acoes: NoraAcao[] = [];
  if (grupos.length > 0) {
    acoes.push({
      tipo: "links",
      intencao,
      dados,
      periodo: { depart, retorno },
      grupos,
      preencherModo: intencao === "hospedagem" ? "hospedagem" : "passagens",
    });
  }
  return { texto, acoes };
}

/* ------------------------------ Ajuda/sistema ----------------------------- */

interface TopicoAjuda {
  gatilhos: RegExp;
  texto: string;
  atalho?: NoraAcao;
}

const AJUDA: TopicoAjuda[] = [
  {
    gatilhos: /(convid|conta compartilhad|parceir|namorad|esposa|marido|dupla junt|mesmo espa[cç]o|convite)/i,
    texto:
      "Para planejarem juntos, abra o convite: clique em \"+ Convidar Parceiro(a)\" no topo do painel e envie o link/código gerado para a pessoa. Ao aceitar, vocês compartilham o mesmo espaço — roteiro, alertas e as despesas da viagem — em tempo real.",
    atalho: { tipo: "atalho", rotulo: "Abrir Modal de Convite", acaoId: "convite" },
  },
  {
    gatilhos: /(nubank|fatura|privacidade|pessoal.*aparec|aparec.*pessoal|triagem|csv|lgpd|prote[cç][ãa]o|meus dados)/i,
    texto:
      "Seus gastos pessoais ficam protegidos: ao importar o CSV do Nubank ou uma nota fiscal, cada item passa por uma triagem antes de entrar na conta compartilhada. Só o que você marca como \"da viagem\" fica visível para o parceiro(a); o que é pessoal permanece privado e nunca entra na divisão. Por segurança, o que não é reconhecido entra como pessoal por padrão. Isso segue os princípios da LGPD (minimização e consentimento).",
    atalho: { tipo: "atalho", rotulo: "Ir para Triagem Nubank", acaoId: "triagem" },
  },
  {
    gatilhos: /(roteiro|passeio|itinerari|itinerári|dia a dia|programa[cç][ãa]o)/i,
    texto:
      "No Roteiro vocês montam o dia a dia da viagem a quatro mãos. Abra a aba Roteiro, adicione atividades por dia (horário, local e observações) — tudo sincroniza com o parceiro(a) automaticamente.",
    atalho: { tipo: "atalho", rotulo: "Abrir Roteiro", acaoId: "roteiro" },
  },
  {
    gatilhos: /\b(como funciona|o que (e|é) o duoplanner|para que serve|ajuda|me explica|sistema)\b/i,
    texto:
      "O DuoPlanner reúne tudo para o casal planejar uma viagem: buscar passagens (voos e ônibus) e hospedagens com links já preenchidos, montar o roteiro, dividir as despesas com privacidade (triagem da fatura Nubank) e compartilhar tudo por convite. É só me descrever o que precisa que eu monto para você.",
  },
];

function responderAjuda(frase: string): NoraResposta | null {
  for (const topico of AJUDA) {
    if (topico.gatilhos.test(frase)) {
      return { texto: topico.texto, acoes: topico.atalho ? [topico.atalho] : [] };
    }
  }
  return null;
}

/* --------------------------------- Roteador -------------------------------- */

/** Ponto de entrada: decide a intenção e devolve a resposta da Nora. */
export function responderNora(frase: string, ctx: NoraContexto = {}): NoraResposta {
  const t = norm(frase);

  if (pareceLancamentoFinanceiro(t, frase)) return responderLancamento(frase, ctx);
  if (pareceConsultaFinanceira(t)) return responderResumoFinanceiro();

  const ajuda = responderAjuda(frase);
  if (ajuda) return ajuda;

  // Sinais de viagem: só vai para a busca quando há um sinal FORTE —
  // termos explícitos de viagem, um IATA resolvido (origem/destino), ou uma
  // data. Um destino "adivinhado" (palavra solta sem IATA e sem termo de
  // viagem) NÃO conta, para não tratar "obrigado" como cidade.
  const dadosPreview = interpretarBusca(frase, ctx.hojeIso ?? todayInSaoPaulo());
  const termosViagem =
    /\b(voo|voos|passagem|passagens|[oô]nibus|hospedagem|hotel|hoteis|hotéis|pousada|pousadas|airbnb|viajar|viagem|ir para|ir a|rumo a|destino)\b/i.test(frase);
  const temIata = Boolean(dadosPreview.originIata || dadosPreview.destinationIata);
  const temData = Boolean(dadosPreview.departDate);
  if (termosViagem || temIata || temData) {
    return responderViagem(frase, ctx);
  }

  // Saudações diretas.
  if (/^\s*(oi|ol[áa]|e a[íi]|bom dia|boa tarde|boa noite|tudo bem|hey)\b/i.test(frase)) {
    return {
      texto:
        "Oi! Sou a Nora, sua agente de viagens e finanças aqui no DuoPlanner. Posso achar passagens e hospedagens, organizar os gastos da dupla e tirar dúvidas. Por onde começamos — já têm um destino em mente?",
      acoes: [],
    };
  }

  // Agradecimentos.
  if (/(obrigad|valeu|muito bom|perfeit|\bshow\b)/i.test(frase)) {
    return {
      texto: "Imagina! Quando quiser montar passagens, hospedagem ou acertar as contas da viagem, é só chamar. 😊",
      acoes: [],
    };
  }

  // Conversa geral: postura de agente, convida a dar o próximo passo.
  return {
    texto:
      "Posso te ajudar de três formas: encontrar passagens e hospedagens (ex.: \"de BH para Búzios, 08 a 15/07, 2 pessoas\"), organizar as finanças da viagem (ex.: \"lance R$ 150 de almoço compartilhado\") ou explicar como o sistema funciona. Me conta o que você quer fazer que eu cuido do resto.",
    acoes: [],
  };
}
