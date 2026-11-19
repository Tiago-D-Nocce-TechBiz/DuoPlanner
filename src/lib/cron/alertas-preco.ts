import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decidirAviso } from "@/lib/alertas/avaliar";
import { roundMoney, toCents } from "@/lib/finance/money";
import { SITE_URL, tabelaAusente } from "@/lib/auth/seguranca";
import { dateInSaoPaulo, daysBetween, todayInSaoPaulo } from "@/lib/dates";
import { buildFlightLinks, buildStayLinks } from "@/lib/deep-links";
import { emailAlertaPreco, linkSeguro } from "@/lib/email/templates";
import { enviarEmail } from "@/lib/mail";
import { criarLeitorDeEmails } from "@/lib/supabase/admin";
import { alertaDaLinha, COLUNAS, type AlertaPreco } from "@/lib/sync/modelos";
import { integracaoAtiva } from "@/lib/env";
import { hotelSearchSchema, searchHotels } from "@/lib/travel/booking";
import { flightSearchSchema, searchFlights } from "@/lib/travel/kiwi";
import type { FlightOffer, HotelOffer } from "@/lib/travel/types";
import { emParalelo } from "./em-paralelo";

/**
 * Monitor diário dos Alertas de Preço (chamado por /api/cron/price-alerts).
 *
 * Para cada alerta ativo com viagem de hoje em diante: consulta o menor preço
 * (Kiwi.com para voos, Booking.com para hospedagem), grava o último preço e o
 * link, e manda e-mail para quem criou o alerta quando `decidirAviso` manda
 * (alvo atingido, respeitando o intervalo entre avisos). Só grava que avisou
 * se o e-mail saiu de fato; sem e-mail configurado, tenta de novo amanhã.
 *
 * Custos sob controle: no máximo `maxAlertas` por rodada, os mais antigos
 * primeiro; alerta já verificado hoje fica de fora (rodar de novo no mesmo
 * dia não paga duas buscas); buscas iguais na mesma rodada viram uma só; e a
 * rodada para de começar buscas novas perto do prazo da função.
 */

export interface ResumoMonitor {
  verificados: number;
  avisados: number;
  semOferta: number;
  /** Alertas sem dados suficientes para a busca automática (ex.: sem aeroporto). */
  incompletos: number;
  /** Motor do tipo do alerta sem chave configurada. */
  semMotor: number;
  /** Ficaram para a próxima rodada (prazo da função). */
  adiados: number;
  erros: number;
}

interface PrecoEncontrado {
  valor: number;
  link: string | null;
  detalhe: string | null;
}

type ResultadoBusca =
  | { ok: true; preco: PrecoEncontrado | null }
  | { ok: false; motivo: "sem_motor" | "incompleto" | "provedor" };

const LINK_MAXIMO = 2048;
const LINK_ALERTAS = `${SITE_URL}/dashboard/alertas`;
const LINK_PREFERENCIAS = `${SITE_URL}/dashboard/configuracoes`;

function descreverVoo(o: FlightOffer): string {
  const companhias = [...new Set(o.airlines.map((a) => a.name))].slice(0, 3).join(", ");
  const escalas = Math.max(o.outbound.stops, o.inbound?.stops ?? 0);
  const trecho = escalas === 0 ? "voo direto" : escalas === 1 ? "até 1 escala por trecho" : `até ${escalas} escalas por trecho`;
  return [companhias, trecho].filter(Boolean).join(" · ");
}

function descreverHotel(h: HotelOffer): string {
  const estrelas = h.stars ? ` · ${h.stars} ${h.stars === 1 ? "estrela" : "estrelas"}` : "";
  const nota = h.reviewScore ? ` · nota ${h.reviewScore.toFixed(1).replace(".", ",")}` : "";
  return `${h.name}${estrelas}${nota}`;
}

/** Link aceito pela CHECK do banco (https e até 2048 caracteres). */
function linkGravavel(url: string | null | undefined): string | null {
  const seguro = linkSeguro(url);
  return seguro && seguro.startsWith("https://") && seguro.length <= LINK_MAXIMO ? seguro : null;
}

/** Busca pré-preenchida no parceiro, para quando a oferta não traz link próprio. */
function linkReserva(a: AlertaPreco): string | null {
  if (a.tipo === "hospedagem") {
    return buildStayLinks({ city: a.destino, checkin: a.ida, checkout: a.volta ?? a.ida, guests: a.adultos, rooms: 1 })[0]?.url ?? null;
  }
  if (!a.origemIata || !a.destinoIata) return null;
  return (
    buildFlightLinks({
      originCity: a.origem,
      destinationCity: a.destino,
      originIata: a.origemIata,
      destinationIata: a.destinoIata,
      departDate: a.ida,
      returnDate: a.volta ?? undefined,
      tripType: a.volta ? "round" : "oneway",
      passengers: a.adultos,
      cabin: "economy",
    })[0]?.url ?? null
  );
}

async function precoDoVoo(a: AlertaPreco): Promise<ResultadoBusca> {
  if (!integracaoAtiva("voos")) return { ok: false, motivo: "sem_motor" };
  if (!a.origemIata || !a.destinoIata) return { ok: false, motivo: "incompleto" };
  const noites = a.volta ? daysBetween(a.ida, a.volta) : null;
  const consulta = flightSearchSchema.safeParse({
    from: a.origemIata,
    to: a.destinoIata,
    dateFrom: a.ida,
    dateTo: a.ida,
    tripType: noites !== null ? "round" : "oneway",
    ...(noites !== null ? { nightsFrom: noites, nightsTo: noites } : {}),
    adults: a.adultos,
    sort: "price",
    memory: "0",
  });
  if (!consulta.success) return { ok: false, motivo: "incompleto" };
  const resultado = await searchFlights(consulta.data, []);
  if (!resultado.ok) return { ok: false, motivo: "provedor" };
  const melhor = resultado.data.offers.reduce<FlightOffer | null>((m, o) => (!m || o.price < m.price ? o : m), null);
  if (!melhor) return { ok: true, preco: null };
  return { ok: true, preco: { valor: melhor.price, link: melhor.bookingUrl, detalhe: descreverVoo(melhor) } };
}

async function precoDaHospedagem(a: AlertaPreco): Promise<ResultadoBusca> {
  if (!integracaoAtiva("hospedagem")) return { ok: false, motivo: "sem_motor" };
  if (!a.volta) return { ok: false, motivo: "incompleto" };
  // Com o alvo como orçamento, a busca devolve primeiro o que cabe nele; se
  // nada cabe, devolve as mais baratas. Nos dois casos o menor preço aparece.
  const consulta = hotelSearchSchema.safeParse({
    city: a.destino,
    checkin: a.ida,
    checkout: a.volta,
    adults: a.adultos,
    rooms: 1,
    ...(a.precoAlvo ? { budget: a.precoAlvo } : {}),
    memory: "0",
  });
  if (!consulta.success) return { ok: false, motivo: "incompleto" };
  const resultado = await searchHotels(consulta.data, []);
  if (!resultado.ok) return { ok: false, motivo: resultado.status === 404 ? "incompleto" : "provedor" };
  const emReais = resultado.data.hotels.filter((h) => h.currency === "BRL");
  const melhor = emReais.reduce<HotelOffer | null>((m, h) => (!m || h.totalPrice < m.totalPrice ? h : m), null);
  if (!melhor) return { ok: true, preco: null };
  return { ok: true, preco: { valor: melhor.totalPrice, link: melhor.bookingUrl, detalhe: descreverHotel(melhor) } };
}

/** Uma linha de `alertas_preco_historico`: o preço do alerta no dia. */
export interface LinhaDeHistorico {
  alerta_id: string;
  workspace_id: string;
  dia: string;
  preco: number;
  verificado_em: string;
}

const PRECO_MAXIMO_DO_HISTORICO = 10_000_000;

/** null quando o alerta não tem espaço (o histórico é por workspace) ou o preço não cabe na CHECK da tabela. */
export function linhaDeHistorico(a: Pick<AlertaPreco, "id" | "workspaceId">, valor: number, dia: string, verificadoEm: string): LinhaDeHistorico | null {
  // roundMoney lança com NaN/Infinity: o histórico nunca pode derrubar a gravação do alerta.
  if (!a.id || !a.workspaceId || !Number.isFinite(valor) || valor <= 0 || valor > PRECO_MAXIMO_DO_HISTORICO) return null;
  const preco = roundMoney(valor);
  if (!(preco > 0)) return null;
  return { alerta_id: a.id, workspace_id: a.workspaceId, dia, preco, verificado_em: verificadoEm };
}

/**
 * Grava o preço do dia de todos os alertas verificados numa única chamada
 * (upsert por alerta e dia: rodar o monitor de novo no mesmo dia atualiza a
 * linha, não cria outra). Banco sem a migration do histórico não é erro: o
 * monitor segue, só não guarda a série.
 */
export async function gravarHistoricoDePrecos(admin: SupabaseClient, linhas: readonly LinhaDeHistorico[]): Promise<"gravado" | "sem_tabela" | "falhou" | "vazio"> {
  if (linhas.length === 0) return "vazio";
  const { error } = await admin.from("alertas_preco_historico").upsert([...linhas], { onConflict: "alerta_id,dia" });
  if (!error) return "gravado";
  if (tabelaAusente(error)) return "sem_tabela";
  console.error("[cron:alertas] falha ao gravar o histórico de preços:", error.message);
  return "falhou";
}

function chaveDaBusca(a: AlertaPreco): string {
  return a.tipo === "voo"
    ? ["voo", a.origemIata, a.destinoIata, a.ida, a.volta, a.adultos].join("|")
    : ["hospedagem", a.destino.trim().toLowerCase(), a.ida, a.volta, a.adultos, a.precoAlvo].join("|");
}

export async function monitorarAlertas(
  admin: SupabaseClient,
  opcoes: { prazoMs: number; maxAlertas?: number; paralelo?: number }
): Promise<{ ok: true; resumo: ResumoMonitor } | { ok: false; mensagem: string }> {
  const encerrarEm = Date.now() + opcoes.prazoMs;
  const hoje = todayInSaoPaulo();
  const resumo: ResumoMonitor = { verificados: 0, avisados: 0, semOferta: 0, incompletos: 0, semMotor: 0, adiados: 0, erros: 0 };

  const { data, error } = await admin
    .from("alertas_preco")
    .select(`${COLUNAS.alertas}, ultimo_preco_notificado`)
    .eq("ativo", true)
    .gte("ida", hoje)
    .order("ultima_verificacao_em", { ascending: true, nullsFirst: true })
    .limit(opcoes.maxAlertas ?? 60);
  if (error) {
    if (tabelaAusente(error)) return { ok: false, mensagem: "Banco sem a migration de sincronização (alertas_preco)." };
    console.error("[cron:alertas] falha ao ler os alertas:", error.message);
    return { ok: false, mensagem: "Não foi possível ler os alertas." };
  }

  const linhas = (data ?? []) as unknown as Record<string, unknown>[];
  const pendentes = linhas
    .map((l) => ({
      alerta: alertaDaLinha(l),
      ultimoPrecoNotificado: l.ultimo_preco_notificado == null ? null : Number(l.ultimo_preco_notificado),
    }))
    .filter(({ alerta }) => alerta.id && dateInSaoPaulo(alerta.ultimaVerificacaoEm ?? "") !== hoje);
  if (pendentes.length === 0) return { ok: true, resumo };

  const donos = [...new Set(pendentes.map((p) => p.alerta.userId))];
  const { data: perfis } = await admin.from("perfis").select("user_id, nome, email_alertas").in("user_id", donos);
  const perfilDe = new Map(
    (perfis ?? []).map((p) => [String(p.user_id), { nome: typeof p.nome === "string" ? p.nome : "", querEmail: p.email_alertas !== false }])
  );
  const emailDe = criarLeitorDeEmails(admin);
  const buscas = new Map<string, Promise<ResultadoBusca>>();
  // Alertas que recebem a MESMA gravação: um UPDATE por grupo no fim, em vez
  // de um por alerta. Os que mudam preço e aviso continuam um a um (cada um
  // tem valores próprios).
  const vistosSemDados: string[] = [];
  const semOferta: string[] = [];
  const historico: LinhaDeHistorico[] = [];
  const verificadoEm = new Date().toISOString();

  await emParalelo(pendentes, opcoes.paralelo ?? 3, async ({ alerta, ultimoPrecoNotificado }) => {
    if (Date.now() > encerrarEm) {
      resumo.adiados++;
      return;
    }
    try {
      const chave = chaveDaBusca(alerta);
      let busca = buscas.get(chave);
      if (!busca) {
        busca = alerta.tipo === "voo" ? precoDoVoo(alerta) : precoDaHospedagem(alerta);
        buscas.set(chave, busca);
      }
      const resultado = await busca;
      const agora = new Date();

      if (!resultado.ok) {
        if (resultado.motivo === "sem_motor") resumo.semMotor++;
        else if (resultado.motivo === "provedor") resumo.erros++;
        else {
          // Sem dados para buscar: marca como visto para não ocupar a fila todo dia.
          resumo.incompletos++;
          vistosSemDados.push(alerta.id);
        }
        return;
      }

      resumo.verificados++;
      if (!resultado.preco) {
        // Nenhuma oferta para as datas: não mostra um preço antigo como se fosse de hoje.
        resumo.semOferta++;
        semOferta.push(alerta.id);
        return;
      }

      const preco = resultado.preco;
      const linhaDoDia = linhaDeHistorico(alerta, preco.valor, hoje, agora.toISOString());
      if (linhaDoDia) historico.push(linhaDoDia);
      const link = linkGravavel(preco.link) ?? linkGravavel(linkReserva(alerta));
      const campos: Record<string, unknown> = {
        ultimo_preco: preco.valor,
        ultimo_link: link,
        ultima_verificacao_em: agora.toISOString(),
      };

      const decisao = decidirAviso(
        preco.valor,
        { precoAlvo: alerta.precoAlvo, ultimoPrecoNotificado, ultimoDisparoEm: alerta.ultimoDisparoEm },
        agora.getTime()
      );
      if (!decisao.notificar && decisao.rearmar) campos.ultimo_preco_notificado = null;

      const perfil = perfilDe.get(alerta.userId);
      if (decisao.notificar && alerta.precoAlvo !== null && perfil?.querEmail !== false) {
        const email = await emailDe(alerta.userId);
        if (email) {
          const montado = emailAlertaPreco({
            nome: perfil?.nome ?? "",
            tipo: alerta.tipo,
            origem: alerta.origem,
            destino: alerta.destino,
            ida: alerta.ida,
            volta: alerta.volta,
            adultos: alerta.adultos,
            precoAtual: preco.valor,
            precoAlvo: alerta.precoAlvo,
            precoAnterior: decisao.precoAnterior,
            detalhe: preco.detalhe,
            linkOferta: link,
            linkAlerta: `${LINK_ALERTAS}#alerta-${alerta.id}`,
            linkPreferencias: LINK_PREFERENCIAS,
          });
          const envio = await enviarEmail({
            para: email,
            assunto: montado.assunto,
            html: montado.html,
            texto: montado.texto,
            idempotencia: `alerta-${alerta.id}-${hoje}-${toCents(preco.valor)}`,
            categoria: "alerta_preco",
          });
          if (envio.ok) {
            campos.ultimo_disparo_em = agora.toISOString();
            campos.ultimo_preco_notificado = preco.valor;
            resumo.avisados++;
          }
        }
      }

      const { error: erroGravar } = await admin.from("alertas_preco").update(campos).eq("id", alerta.id);
      if (erroGravar) {
        console.error("[cron:alertas] falha ao gravar o alerta:", erroGravar.message);
        resumo.erros++;
      }
    } catch (erro) {
      console.error("[cron:alertas] erro inesperado:", erro instanceof Error ? erro.message : erro);
      resumo.erros++;
    }
  });

  const gravacoesEmGrupo = await Promise.all([
    vistosSemDados.length
      ? admin.from("alertas_preco").update({ ultima_verificacao_em: verificadoEm }).in("id", vistosSemDados)
      : null,
    semOferta.length
      ? admin
          .from("alertas_preco")
          .update({ ultimo_preco: null, ultimo_link: null, ultima_verificacao_em: verificadoEm })
          .in("id", semOferta)
      : null,
  ]);
  if ((await gravarHistoricoDePrecos(admin, historico)) === "falhou") resumo.erros++;
  for (const gravacao of gravacoesEmGrupo) {
    if (gravacao?.error) {
      console.error("[cron:alertas] falha ao gravar um grupo de alertas:", gravacao.error.message);
      resumo.erros++;
    }
  }

  return { ok: true, resumo };
}
