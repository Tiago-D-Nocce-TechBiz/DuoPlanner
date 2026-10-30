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
import { todayInSaoPaulo, addDays, monthLabel } from "@/lib/dates";
import {
  adicionarDespesa,
  resumirDespesas,
  classificarItemAutomaticamente,
  idAleatorio,
  type Escopo,
  type ItemDespesa,
} from "@/lib/finance/store";

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
  | { tipo: "despesa"; item: ItemDespesa }
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
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/* -------------------------------- Finanças -------------------------------- */

/** Extrai um valor em reais da frase (ex.: "R$ 150", "150,90", "90 reais"). */
function extrairValor(frase: string): number | null {
  const m = frase.match(/r?\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais|r\$)?/i);
  if (!m) return null;
  const bruto = m[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const v = parseFloat(bruto);
  return isNaN(v) || v <= 0 ? null : v;
}

/** Título do gasto: remove o verbo/valor e deixa a descrição. */
function extrairTituloGasto(frase: string): string {
  let t = frase
    .replace(/\b(lance|lanca|lançar|lancar|adicione|adicionar|registre|registrar|anote|anotar|gasto|gastei|paguei|despesa|de)\b/gi, " ")
    .replace(/r?\$?\s*\d[\d.,]*\s*(?:reais)?/gi, " ")
    .replace(/\b(como|compartilhad[oa]|da viagem|viagem|pessoal|privad[oa]|oculto|meu|minha)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) t = "Gasto";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function pareceLancamentoFinanceiro(t: string): boolean {
  const temVerbo = /\b(lance|lanca|lançar|lancar|adicione|adicionar|registre|registrar|anote|anotar|gastei|paguei)\b/.test(t);
  const temValor = /r?\$?\s*\d/.test(t);
  const temGasto = /\b(gasto|despesa)\b/.test(t);
  const temEscopo = /(compartilhad|pessoal|privad|da viagem)/.test(t);
  // Casos que indicam lançar um gasto:
  // - verbo + (valor OU "gasto/despesa");
  // - "gasto/despesa" + valor;
  // - valor + escopo explícito ("R$ 150 ... compartilhado/pessoal"), mesmo sem verbo.
  return (temVerbo && (temValor || temGasto)) || (temGasto && temValor) || (temValor && temEscopo);
}

function pareceConsultaFinanceira(t: string): boolean {
  return /\b(quanto|resumo|total|gastamos|gastei|saldo|divis|cada um|metade|50)\b/.test(t) && /\b(gast|viagem|despesa|conta|dividir|cada)\b/.test(t);
}

function responderLancamento(frase: string): NoraResposta {
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

  const classificado = classificarItemAutomaticamente(titulo, valor, new Date().toLocaleDateString("pt-BR"), "Nora");
  const item: ItemDespesa = {
    ...classificado,
    id: idAleatorio(),
    escopo: escopo ?? classificado.escopo,
  };
  adicionarDespesa(item);

  const privado = item.escopo === "pessoal_privado";
  return {
    texto: privado
      ? `Pronto! Registrei ${brl(item.valor)} em "${item.estabelecimento}" como gasto pessoal privado — ele fica oculto para o parceiro(a) e nunca entra na divisão.`
      : `Pronto! Registrei ${brl(item.valor)} em "${item.estabelecimento}" como gasto compartilhado da viagem. Ele já entra na divisão 50/50.`,
    acoes: [
      { tipo: "despesa", item },
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
  const dados = interpretarBusca(frase);

  // Usa a cidade base do casal como origem quando o usuário não informa.
  if (!dados.originCity && !dados.originIata && ctx.cidadeBase) {
    dados.originCity = ctx.cidadeBase;
    dados.originIata = ctx.iataBase || iataDaCidade(ctx.cidadeBase);
  }

  if (!temSinalDeViagem(dados)) {
    return {
      texto: "Me diga a viagem em uma frase, por exemplo: \"de Belo Horizonte para Búzios de 08/07 a 31/07, 2 pessoas\" ou \"pousadas em Cabo Frio no Réveillon\".",
      acoes: [],
    };
  }

  const intencao = inferirIntencao(frase);
  const depart = dados.departDate ?? addDays(todayInSaoPaulo(), 14);
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

  const texto =
    grupos.length > 0
      ? `Encontrei as melhores opções ${resumoViagem}. Toque em um parceiro para abrir a busca já preenchida${avisos.length ? ". " + avisos.join(" ") : "."}`
      : `Entendi ${resumoViagem}, mas preciso de mais detalhes para montar os links. ${avisos.join(" ")}`;

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

  if (pareceLancamentoFinanceiro(t)) return responderLancamento(frase);
  if (pareceConsultaFinanceira(t)) return responderResumoFinanceiro();

  const ajuda = responderAjuda(frase);
  if (ajuda) return ajuda;

  // Sinais de viagem: só vai para a busca quando há um sinal FORTE —
  // termos explícitos de viagem, um IATA resolvido (origem/destino), ou uma
  // data. Um destino "adivinhado" (palavra solta sem IATA e sem termo de
  // viagem) NÃO conta, para não tratar "obrigado" como cidade.
  const dadosPreview = interpretarBusca(frase);
  const termosViagem =
    /\b(voo|voos|passagem|passagens|[oô]nibus|hospedagem|hotel|hoteis|hotéis|pousada|pousadas|airbnb|viajar|viagem|ir para|ir a|rumo a|destino)\b/i.test(frase);
  const temIata = Boolean(dadosPreview.originIata || dadosPreview.destinationIata);
  const temData = Boolean(dadosPreview.departDate);
  if (termosViagem || temIata || temData) {
    return responderViagem(frase, ctx);
  }

  // Conversa geral / saudação.
  return {
    texto:
      "Posso ajudar com passagens e hospedagens (ex.: \"de BH para Búzios de 08/07 a 31/07, 2 pessoas\"), organizar as finanças da viagem (ex.: \"lance R$ 150 de almoço compartilhado\") ou tirar dúvidas sobre o sistema. O que você precisa?",
    acoes: [],
  };
}
