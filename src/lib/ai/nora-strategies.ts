/**
 * Catálogo das 10 estratégias de economia, auditoria e gestão de custos da Nora
 * ("Nora Travel Hacks"): comandos, rótulos, ícones, o que cada uma precisa
 * saber da viagem e o formato (tipos) da análise que ela devolve.
 *
 * Sem dependências de propósito: a gaveta da Nora (navegador) importa daqui
 * e não pode levar zod nem LangChain. O que é só do servidor fica em
 * `nora-strategies-servidor.ts` (prompts de cada estratégia e schemas Zod da
 * resposta da IA); as listas de conferência locais (sem IA), em
 * `nora-strategies-local.ts`.
 */

import type { ResumoDeCustos } from "./cost-agent-metrics";

export const ESTRATEGIA_IDS = [
  "matriz_datas",
  "aeroportos_proximos",
  "conexoes_inteligentes",
  "auditoria_voo",
  "verificacao_taxas",
  "escolha_bairros",
  "comparativo_hospedagem",
  "otimizacao_orcamento",
  "veredito_reserva",
  "gestao_custos",
] as const;
export type EstrategiaId = (typeof ESTRATEGIA_IDS)[number];

/** Nomes dos ícones (`@/components/ui/icons`); o mapa para componentes fica em `nora-icones.ts`. */
export type NomeIcone = "Calendar" | "PlaneTakeoff" | "Layers" | "ShieldCheck" | "ReceiptText" | "MapPin" | "Hotel" | "TrendingDown" | "CheckCircle2" | "Wallet";

/**
 * O que a estratégia precisa saber para valer a pena chamar a IA:
 *  - "destino": para onde a dupla vai (vem da última busca, de um alerta ou do pedido);
 *  - "destino_ou_roteiro": basta saber o destino OU já haver atividades no roteiro;
 *  - "roteiro_ou_gastos": há roteiro ou gastos lançados para analisar;
 *  - "gastos_ou_custos": há gastos compartilhados lançados ou custos estimados no
 *    Roteiro (a gestão de custos trabalha sobre números, não sobre texto livre).
 */
export type Requisito = "destino" | "destino_ou_roteiro" | "roteiro_ou_gastos" | "gastos_ou_custos";

export interface Estrategia {
  id: EstrategiaId;
  /** Comando digitado na gaveta, sempre começando com "/" (minúsculas, sem acento). */
  slashCommand: string;
  /** Outros nomes aceitos para o mesmo comando. */
  apelidos: readonly string[];
  /** Nome curto do atalho (chip) e do card. */
  label: string;
  shortDescription: string;
  iconName: NomeIcone;
  requer: Requisito;
}

export const ESTRATEGIAS: readonly Estrategia[] = [
  {
    id: "matriz_datas",
    slashCommand: "/datas-baratas",
    apelidos: ["/matriz-de-datas", "/datas-flexiveis"],
    label: "Datas Baratas",
    shortDescription: "Janelas flexíveis de ida e volta com as melhores chances de preço baixo",
    iconName: "Calendar",
    requer: "destino",
  },
  {
    id: "aeroportos_proximos",
    slashCommand: "/aeroportos-proximos",
    apelidos: ["/aeroportos-alternativos", "/aeroportos"],
    label: "Aeroportos Próximos",
    shortDescription: "Aeroportos alternativos até 240 km, com o custo de chegar lá por terra",
    iconName: "PlaneTakeoff",
    requer: "destino",
  },
  {
    id: "conexoes_inteligentes",
    slashCommand: "/conexoes-inteligentes",
    apelidos: ["/conexoes", "/self-transfer"],
    label: "Conexões Inteligentes",
    shortDescription: "Conexões por conta própria (self-transfer): quanto economiza e que riscos assume",
    iconName: "Layers",
    requer: "destino",
  },
  {
    id: "auditoria_voo",
    slashCommand: "/auditar-voo",
    apelidos: ["/auditoria-de-voo", "/nota-do-voo"],
    label: "Auditar Voo",
    shortDescription: "Nota de 1 a 10 e as pegadinhas da tarifa (bagagem, remarcação, assento)",
    iconName: "ShieldCheck",
    requer: "destino",
  },
  {
    id: "verificacao_taxas",
    slashCommand: "/verificar-taxas",
    apelidos: ["/taxas-ocultas", "/taxas"],
    label: "Taxas Ocultas",
    shortDescription: "Resort fee, city tax, bagagem, traslado: o que não aparece no preço anunciado",
    iconName: "ReceiptText",
    requer: "destino_ou_roteiro",
  },
  {
    id: "escolha_bairros",
    slashCommand: "/escolher-bairro",
    apelidos: ["/bairros", "/onde-ficar"],
    label: "Onde Ficar",
    shortDescription: "Top 3 bairros para o seu perfil: segurança, transporte e orçamento por noite",
    iconName: "MapPin",
    requer: "destino",
  },
  {
    id: "comparativo_hospedagem",
    slashCommand: "/comparar-hospedagem",
    apelidos: ["/hotel-ou-airbnb", "/comparativo"],
    label: "Hotel ou Airbnb?",
    shortDescription: "Custo total real: hotel x Airbnb x apart-hotel, com taxas e cozinha",
    iconName: "Hotel",
    requer: "destino",
  },
  {
    id: "otimizacao_orcamento",
    slashCommand: "/otimizar-roteiro",
    apelidos: ["/cortar-20", "/otimizar-orcamento"],
    label: "Cortar 20%",
    shortDescription: "Como tirar 20% do custo do roteiro sem perder conforto nem segurança",
    iconName: "TrendingDown",
    requer: "roteiro_ou_gastos",
  },
  {
    id: "veredito_reserva",
    slashCommand: "/veredito-reserva",
    apelidos: ["/reservar-ou-esperar", "/veredito"],
    label: "Reservar ou Esperar?",
    shortDescription: "Decisão final: reserve agora, espere ou mude de plano",
    iconName: "CheckCircle2",
    requer: "destino",
  },
  {
    id: "gestao_custos",
    slashCommand: "/gestao-de-custos",
    apelidos: ["/custos", "/meus-gastos", "/orcamento"],
    label: "Gestão de Custos",
    shortDescription: "O que já gastaram, ritmo, parcelas a pagar e alertas de custo do casal",
    iconName: "Wallet",
    requer: "gastos_ou_custos",
  },
];

const PORID = new Map(ESTRATEGIAS.map((e) => [e.id, e]));

export function estrategiaPorId(id: EstrategiaId): Estrategia {
  const e = PORID.get(id);
  if (!e) throw new RangeError(`Estratégia desconhecida: ${id}`);
  return e;
}

/** Minúsculas, sem acento e sem a barra inicial: a forma de comparar comandos. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^\/+/, "");
}

/**
 * Comandos que combinam com o que a pessoa digitou depois da "/" (menu da
 * gaveta). Vazio mostra os 9. Quem começa com o texto vem primeiro, depois
 * quem só contém o texto no comando, no nome ou nos apelidos.
 */
export function filtrarComandos(consulta: string): Estrategia[] {
  const q = normalizar(consulta);
  if (!q) return [...ESTRATEGIAS];
  const comeca: Estrategia[] = [];
  const contem: Estrategia[] = [];
  for (const e of ESTRATEGIAS) {
    const comandos = [e.slashCommand, ...e.apelidos].map(normalizar);
    if (comandos.some((c) => c.startsWith(q))) comeca.push(e);
    else if (comandos.some((c) => c.includes(q)) || normalizar(e.label).includes(q)) contem.push(e);
  }
  return [...comeca, ...contem];
}

/**
 * "/auditar-voo GRU-LIS por R$ 4.200" → estratégia + o resto do texto.
 * Só vale comando completo e conhecido (ou apelido); qualquer outra coisa
 * volta null e segue como pergunta normal para a Nora.
 */
export function interpretarComando(texto: string): { estrategia: Estrategia; resto: string } | null {
  const m = /^\s*(\/[^\s]+)(?:\s+([\s\S]*))?$/.exec(texto);
  if (!m) return null;
  const digitado = normalizar(m[1]);
  const estrategia = ESTRATEGIAS.find((e) => [e.slashCommand, ...e.apelidos].some((c) => normalizar(c) === digitado));
  return estrategia ? { estrategia, resto: (m[2] ?? "").trim() } : null;
}

/** Estratégias cujo card mostra o painel de custos (números calculados pelo app). */
export const ESTRATEGIAS_COM_PAINEL_DE_CUSTOS: readonly EstrategiaId[] = ["gestao_custos"];

/* --------------------------- A análise devolvida --------------------------- */

export const VEREDITOS = ["RESERVE_AGORA", "ESPERE", "MUDE_DE_PLANO"] as const;
export type Veredito = (typeof VEREDITOS)[number];

export const GRAVIDADES = ["info", "atencao", "critico"] as const;
export type Gravidade = (typeof GRAVIDADES)[number];

export const ACOES_SUGERIDAS = ["nenhuma", "salvar_dica_roteiro", "criar_alerta_preco"] as const;
export type AcaoSugerida = (typeof ACOES_SUGERIDAS)[number];

export interface PontoDeAtencao {
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
}

export interface OpcaoAnalise {
  titulo: string;
  /** Selo curto ("Mais barata", "Melhor para casal"). */
  destaque: string | null;
  detalhe: string;
  /** Estimativa em reais; null quando não faz sentido pôr valor. */
  custoEstimadoBrl: number | null;
}

/** O que cada estratégia devolve, nas seções que o card sabe mostrar. */
export interface AnaliseNora {
  resumo: string;
  /** Só a estratégia "veredito_reserva" preenche. */
  vereditoBadge: Veredito | null;
  /** 1 a 10; a "auditoria_voo" preenche. */
  notaCustoBeneficio: number | null;
  economiaEstimada: { valorBrl: number; descricao: string } | null;
  opcoes: OpcaoAnalise[];
  pontosDeAtencao: PontoDeAtencao[];
  recomendacaoPratica: string;
  acaoSugerida: AcaoSugerida;
  /** Preço-alvo sugerido para um alerta de preço (R$), quando fizer sentido. */
  precoAlvoSugeridoBrl: number | null;
}

/** O que a Nora usou da viagem do casal (e o que os botões do card reaproveitam). */
export interface ContextoUsado {
  destino: string | null;
  origem: string | null;
  /** AAAA-MM-DD */
  ida: string | null;
  volta: string | null;
  adultos: number | null;
  diasNoRoteiro: number;
  atividadesNoRoteiro: number;
  gastoCompartilhadoBrl: number;
  quantidadeDePreferencias: number;
}

export const CONTEXTO_VAZIO: ContextoUsado = {
  destino: null,
  origem: null,
  ida: null,
  volta: null,
  adultos: null,
  diasNoRoteiro: 0,
  atividadesNoRoteiro: 0,
  gastoCompartilhadoBrl: 0,
  quantidadeDePreferencias: 0,
};

export type ResultadoAdvisor =
  | {
      tipo: "analise";
      estrategia: EstrategiaId;
      /** "ia": Gemini; "local": lista de conferência (sem chave, cota, prazo ou sem conexão). */
      origem: "ia" | "local";
      analise: AnaliseNora;
      /** Números de custo calculados pelo app (só nas estratégias com painel de custos). */
      custos: ResumoDeCustos | null;
      contexto: ContextoUsado;
      /** Por que caiu na lista local (ou aviso extra), em PT-BR. */
      aviso: string | null;
    }
  | {
      tipo: "pergunta";
      estrategia: EstrategiaId;
      /** O que falta saber, em PT-BR, para a pessoa responder na conversa. */
      pergunta: string;
      contexto: ContextoUsado;
    };

/** A análise tem algum valor em reais (estimativa histórica que o card precisa ressalvar)? */
export function temEstimativaEmReais(a: AnaliseNora): boolean {
  return a.economiaEstimada !== null || a.precoAlvoSugeridoBrl !== null || a.opcoes.some((o) => o.custoEstimadoBrl !== null);
}
