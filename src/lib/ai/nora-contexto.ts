import type { SupabaseClient } from "@supabase/supabase-js";
import { valorEmReais } from "@/lib/finance/acerto";
import { sumMoney } from "@/lib/finance/money";
import {
  estrategiaPorId,
  type ContextoUsado,
  type EstrategiaId,
} from "./nora-strategies";

/**
 * Contexto da viagem do casal para a Nora, montado sozinho a partir do
 * workspace: ninguém precisa redigitar destino, datas, roteiro nem gastos.
 *
 * Não existe uma "viagem" salva com destino e datas. O destino e as datas
 * vêm, nesta ordem, de: um alerta de preço ativo, a última busca de voo ou
 * hospedagem (`viagens`) e, para as datas, do próprio roteiro quando ele já
 * tem dias com data.
 *
 * Privacidade: só entram gastos COMPARTILHADOS (os privados de cada pessoa
 * nunca vão para a IA). O texto vindo do banco (títulos do roteiro, destinos)
 * é digitado por pessoas: é limpo e encurtado e entra no prompt como dado.
 */

/* --------------------------------- Leitura --------------------------------- */

export interface DadosBrutos {
  buscas: { tipo: string | null; origem: string | null; destino: string | null; dados: unknown; created_at: string }[];
  dias: { id: string; data: string | null; ordem: number }[];
  itens: { dia_id: string | null; horario: string | null; titulo: string | null; ordem: number }[];
  despesas: { valor: number | string; moeda: string; cotacao_brl: number | string | null; categoria: string }[];
  alertas: { tipo: string; origem: string | null; destino: string; ida: string; volta: string | null; adultos: number | null }[];
}

export const DADOS_VAZIOS: DadosBrutos = { buscas: [], dias: [], itens: [], despesas: [], alertas: [] };

/** Tetos de leitura: o contexto é um resumo, não um espelho do banco. */
export const LIMITES_CONTEXTO = { buscas: 5, dias: 60, itens: 300, despesas: 500, alertas: 10 } as const;

/**
 * Lê do workspace só o que a Nora usa, com colunas explícitas (sem
 * `SELECT *`), tudo em paralelo. A RLS já restringe ao espaço do casal; o
 * filtro `workspace_id` repete a regra e os gastos privados ficam de fora.
 * Falha numa leitura = aquela parte vazia (a Nora responde com o que tem).
 */
export async function carregarDadosBrutos(supabase: SupabaseClient, workspaceId: string): Promise<DadosBrutos> {
  const [buscas, dias, itens, despesas, alertas] = await Promise.all([
    Promise.resolve(
      supabase
        .from("viagens")
        .select("tipo, origem, destino, dados, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(LIMITES_CONTEXTO.buscas)
    ),
    Promise.resolve(
      supabase.from("roteiro_dias").select("id, data, ordem").eq("workspace_id", workspaceId).order("ordem").limit(LIMITES_CONTEXTO.dias)
    ),
    Promise.resolve(
      supabase
        .from("roteiro_itens")
        .select("dia_id, horario, titulo, ordem")
        .eq("workspace_id", workspaceId)
        .order("ordem")
        .limit(LIMITES_CONTEXTO.itens)
    ),
    Promise.resolve(
      supabase
        .from("despesas_viagem")
        .select("valor, moeda, cotacao_brl, categoria")
        .eq("workspace_id", workspaceId)
        .eq("escopo", "viagem_compartilhado")
        .eq("tipo", "gasto")
        .order("data", { ascending: false })
        .limit(LIMITES_CONTEXTO.despesas)
    ),
    Promise.resolve(
      supabase
        .from("alertas_preco")
        .select("tipo, origem, destino, ida, volta, adultos")
        .eq("workspace_id", workspaceId)
        .eq("ativo", true)
        .order("atualizado_em", { ascending: false })
        .limit(LIMITES_CONTEXTO.alertas)
    ),
  ]);
  const dado = <T>(r: { data: T[] | null; error: { message: string } | null }, nome: string): T[] => {
    if (r.error) console.error(`[nora] leitura de ${nome} falhou:`, r.error.message);
    return r.data ?? [];
  };
  return {
    buscas: dado(buscas as never, "viagens"),
    dias: dado(dias as never, "roteiro_dias"),
    itens: dado(itens as never, "roteiro_itens"),
    despesas: dado(despesas as never, "despesas_viagem"),
    alertas: dado(alertas as never, "alertas_preco"),
  };
}

/* --------------------------------- Resumo ---------------------------------- */

export interface ContextoViagem {
  destino: string | null;
  fonteDoDestino: "alerta" | "busca" | null;
  origem: string | null;
  ida: string | null;
  volta: string | null;
  adultos: number | null;
  roteiro: { numero: number; data: string | null; atividades: string[] }[];
  totalAtividades: number;
  gastos: { totalBrl: number; quantidade: number; semCotacao: number; porCategoria: { categoria: string; totalBrl: number }[] };
  preferencias: string[];
}

/** Texto digitado por alguém, seguro para o prompt: uma linha, sem marcação, com teto. */
export function limparTexto(valor: unknown, max = 80): string {
  if (typeof valor !== "string") return "";
  return valor
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const dataIso = (v: unknown): string | null => (typeof v === "string" && DATA_ISO.test(v) ? v : null);
const nome = (v: unknown): string | null => limparTexto(v, 80) || null;
const inteiro = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

interface Viagem {
  destino: string | null;
  origem: string | null;
  ida: string | null;
  volta: string | null;
  adultos: number | null;
}

/** Destino e datas de uma busca salva (`dados` é jsonb: nada ali é confiável). */
function viagemDaBusca(b: DadosBrutos["buscas"][number]): Viagem | null {
  const d = (typeof b.dados === "object" && b.dados !== null ? b.dados : {}) as Record<string, unknown>;
  const destino = nome(b.destino) ?? nome(d.destinationCity) ?? nome(d.city);
  if (!destino) return null;
  return {
    destino,
    origem: nome(b.origem) ?? nome(d.originCity),
    ida: dataIso(d.departDate) ?? dataIso(d.checkin),
    volta: dataIso(d.returnDate) ?? dataIso(d.checkout),
    adultos: inteiro(d.passengers, 1, 9) ?? inteiro(d.guests, 1, 9),
  };
}

export function resumirContexto(dados: DadosBrutos, preferencias: readonly string[], hojeIso: string): ContextoViagem {
  // 1) Alerta ativo com viagem ainda por vir; 2) última busca com destino.
  const alerta = dados.alertas.find((a) => dataIso(a.ida) && a.ida >= hojeIso && nome(a.destino));
  let viagem: Viagem | null = null;
  let fonte: ContextoViagem["fonteDoDestino"] = null;
  if (alerta) {
    viagem = {
      destino: nome(alerta.destino),
      origem: nome(alerta.origem),
      ida: dataIso(alerta.ida),
      volta: dataIso(alerta.volta),
      adultos: inteiro(alerta.adultos, 1, 9),
    };
    fonte = "alerta";
  } else {
    for (const b of dados.buscas) {
      viagem = viagemDaBusca(b);
      if (viagem) {
        fonte = "busca";
        break;
      }
    }
  }

  // Roteiro: dias em ordem, com as atividades de cada um.
  const diasOrdenados = [...dados.dias].sort((a, b) => a.ordem - b.ordem);
  const porDia = new Map<string, string[]>();
  let totalAtividades = 0;
  for (const item of [...dados.itens].sort((a, b) => a.ordem - b.ordem)) {
    const titulo = limparTexto(item.titulo, 80);
    if (!item.dia_id || !titulo) continue;
    const hora = limparTexto(item.horario, 5);
    const lista = porDia.get(item.dia_id) ?? [];
    lista.push(hora ? `${hora} ${titulo}` : titulo);
    porDia.set(item.dia_id, lista);
    totalAtividades++;
  }
  const roteiro = diasOrdenados.map((d, i) => ({ numero: i + 1, data: dataIso(d.data), atividades: porDia.get(d.id) ?? [] }));

  // Datas do roteiro (o plano de fato) valem mais que as da busca.
  const datas = roteiro.map((d) => d.data).filter((d): d is string => d !== null).sort();
  const ida = datas.length > 0 ? datas[0] : (viagem?.ida ?? null);
  const volta = datas.length > 1 ? datas[datas.length - 1] : (viagem?.volta ?? null);

  // Gastos compartilhados, em reais, por categoria.
  const porCategoria = new Map<string, number[]>();
  let semCotacao = 0;
  const todos: number[] = [];
  for (const d of dados.despesas) {
    const emReais = valorEmReais({ valor: Number(d.valor), moeda: d.moeda, cotacaoBrl: d.cotacao_brl === null ? null : Number(d.cotacao_brl) });
    if (emReais === null) {
      semCotacao++;
      continue;
    }
    todos.push(emReais);
    const categoria = limparTexto(d.categoria, 40) || "Outros";
    porCategoria.set(categoria, [...(porCategoria.get(categoria) ?? []), emReais]);
  }

  return {
    destino: viagem?.destino ?? null,
    fonteDoDestino: fonte,
    origem: viagem?.origem ?? null,
    ida,
    volta: volta && ida && volta >= ida ? volta : null,
    adultos: viagem?.adultos ?? null,
    roteiro,
    totalAtividades,
    gastos: {
      totalBrl: sumMoney(todos),
      quantidade: todos.length,
      semCotacao,
      porCategoria: [...porCategoria.entries()]
        .map(([categoria, valores]) => ({ categoria, totalBrl: sumMoney(valores) }))
        .sort((a, b) => b.totalBrl - a.totalBrl),
    },
    preferencias: preferencias.map((p) => limparTexto(p, 120)).filter(Boolean),
  };
}

/** O que vai para a tela (e para os botões do card): sem os textos do roteiro. */
export function paraContextoUsado(c: ContextoViagem): ContextoUsado {
  return {
    destino: c.destino,
    origem: c.origem,
    ida: c.ida,
    volta: c.volta,
    adultos: c.adultos,
    diasNoRoteiro: c.roteiro.length,
    atividadesNoRoteiro: c.totalAtividades,
    gastoCompartilhadoBrl: c.gastos.totalBrl,
    quantidadeDePreferencias: c.preferencias.length,
  };
}

/* --------------------------------- Lacunas --------------------------------- */

/** Resposta do casal com este tamanho já conta como informação (destino, datas, valores). */
const TEXTO_MINIMO = { destino: 3, roteiro: 12 } as const;

/**
 * A estratégia tem o que precisa? Se não, a pergunta (em PT-BR) que a Nora
 * faz no lugar de gastar uma chamada à IA. Roteiro vazio só trava as
 * estratégias que dependem dele.
 */
export function perguntaDeLacuna(id: EstrategiaId, c: ContextoViagem, texto: string): string | null {
  const t = texto.trim().length;
  const temDestino = c.destino !== null || t >= TEXTO_MINIMO.destino;
  switch (estrategiaPorId(id).requer) {
    case "destino":
      return temDestino
        ? null
        : "Para qual destino e em quais datas vocês querem essa análise? Responda aqui (ex.: “Lisboa, de 10 a 17 de março”) ou faça uma busca de passagens ou de hospedagem, que eu leio o destino sozinha.";
    case "destino_ou_roteiro":
      return temDestino || c.totalAtividades > 0
        ? null
        : "Ainda não sei para onde vocês vão e o roteiro está vazio. Diga o destino (ex.: “Lisboa”) ou adicione atividades no Roteiro, que eu analiso as taxas do que vocês planejaram.";
    case "roteiro_ou_gastos":
      return c.totalAtividades > 0 || c.gastos.quantidade > 0 || t >= TEXTO_MINIMO.roteiro
        ? null
        : "O roteiro e os gastos da viagem ainda estão vazios, então não há o que cortar. Adicione atividades no Roteiro ou lance os gastos no DuoFinance, ou me conte aqui o que vocês planejam (hospedagem, passeios, valores).";
  }
}

/* ---------------------------------- Prompt --------------------------------- */

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

function noites(ida: string, volta: string): number {
  return Math.round((Date.parse(`${volta}T00:00:00Z`) - Date.parse(`${ida}T00:00:00Z`)) / 86_400_000);
}

/** Bloco de dados da viagem no prompt (delimitado: a IA o trata como dado, não como instrução). */
export function blocoDoContexto(c: ContextoViagem, hojeIso: string): string {
  const linhas = [`Hoje: ${hojeIso}`];
  linhas.push(
    c.destino
      ? `Destino: ${c.destino}${c.fonteDoDestino === "alerta" ? " (do alerta de preço do casal)" : " (da última busca do casal)"}`
      : "Destino: não informado"
  );
  if (c.origem) linhas.push(`Origem: ${c.origem}`);
  if (c.ida) linhas.push(`Datas: ${c.ida}${c.volta ? ` a ${c.volta} (${noites(c.ida, c.volta)} noites)` : " (só ida)"}`);
  else linhas.push("Datas: não informadas");
  linhas.push(`Viajantes: ${c.adultos ?? 2}`);

  if (c.roteiro.length === 0) linhas.push("Roteiro: vazio");
  else {
    linhas.push(`Roteiro (${c.roteiro.length} dias, ${c.totalAtividades} atividades):`);
    for (const d of c.roteiro.slice(0, 14)) {
      const atividades = d.atividades.slice(0, 6).join("; ") || "sem atividades";
      linhas.push(`- Dia ${d.numero}${d.data ? ` (${d.data})` : ""}: ${atividades}`);
    }
    if (c.roteiro.length > 14) linhas.push(`- ... e mais ${c.roteiro.length - 14} dias`);
  }

  if (c.gastos.quantidade === 0) linhas.push("Gastos compartilhados lançados: nenhum");
  else {
    const cats = c.gastos.porCategoria.slice(0, 6).map((g) => `${g.categoria} ${brl(g.totalBrl)}`).join(", ");
    linhas.push(`Gastos compartilhados lançados: ${brl(c.gastos.totalBrl)} em ${c.gastos.quantidade} lançamentos (${cats})`);
  }
  linhas.push(c.preferencias.length > 0 ? `Preferências do casal: ${c.preferencias.join("; ")}` : "Preferências do casal: nenhuma registrada");
  return `<contexto_da_viagem>\n${linhas.join("\n")}\n</contexto_da_viagem>`;
}

/** Mensagem do usuário para o modelo: o contexto automático + o que o casal escreveu. */
export function mensagemParaOModelo(c: ContextoViagem, hojeIso: string, textoLivre: string): string {
  const pedido = limparTexto(textoLivre, 600);
  return `${blocoDoContexto(c, hojeIso)}\n\n<pedido_do_casal>\n${pedido || "(sem detalhes extras: use o contexto da viagem)"}\n</pedido_do_casal>`;
}
