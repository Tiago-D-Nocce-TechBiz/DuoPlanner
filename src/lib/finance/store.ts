"use client";

/**
 * DuoFinance no navegador — agora sobre o motor de sincronização do casal.
 *
 * Antes, a lista vivia só no localStorage (o par nunca via os gastos). Agora
 * cada gasto é uma linha de `despesas_viagem` no Postgres (RLS por espaço e
 * escopo), com fila offline e Realtime. A API usada pela Nora, pela página
 * do DuoFinance e pelo importador de faturas:
 *  - `ItemDespesa`: RASCUNHO (proposta da Nora);
 *  - `adicionarDespesa(rascunho)` / `criarDespesa(...)`: grava (fila); a
 *    fatura importada passa `fatura` com parcelas e categoria detalhada;
 *  - `useDespesas()` / `resumirDespesas()`: leitura reativa e resumo.
 */

import { calcularAcerto, descreverRegra, valorEmReais, type LancamentoAcerto } from "@/lib/finance/acerto";
import type { CategoriaDuoFinance } from "@/lib/finance/categorias-duofinance";
import { classificarDespesa, type Categoria, type Escopo } from "@/lib/finance/classificar";
import { fromCents, roundMoney, splitAmount, sumMoney, toCents } from "@/lib/finance/money";
import { todayInSaoPaulo } from "@/lib/dates";
import { regraDoAcordo, type ContextoSincronizacao } from "@/lib/sync/contexto";
import type { Despesa, OrigemDespesa } from "@/lib/sync/modelos";
import {
  atualizarRegistro,
  criarRegistro,
  getContexto,
  getRegistros,
  removerRegistro,
  useRegistros,
} from "@/lib/sync/motor";

export type { Categoria, Escopo } from "@/lib/finance/classificar";
export type { Despesa } from "@/lib/sync/modelos";

/** Rascunho de gasto (ainda não salvo), como a proposta da Nora. */
export interface ItemDespesa {
  id: string;
  data: string; // "dd/mm/aaaa" (locale pt-BR)
  estabelecimento: string;
  valor: number;
  categoriaDestino: Categoria;
  escopo: Escopo;
  origem: string; // "Manual" | "Importado" | "Nora"
}

export function idAleatorio(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

/**
 * Monta um rascunho já classificado (regras em `@/lib/finance/classificar`:
 * palavra inteira, privado por padrão). `dica` é a categoria vinda do banco.
 */
export function classificarItemAutomaticamente(
  titulo: string,
  valor: number,
  data: string,
  origem = "Importado",
  dica?: string
): ItemDespesa {
  const { categoria, escopo } = classificarDespesa(titulo, dica);
  return {
    id: idAleatorio(),
    data,
    estabelecimento: titulo,
    valor,
    origem,
    categoriaDestino: categoria,
    escopo,
  };
}

/** Rótulo exibido: item da viagem sem categoria de viagem aparece como "Outros da viagem". */
export function rotuloCategoria(item: { escopo: Escopo; categoria?: Categoria; categoriaDestino?: Categoria }): string {
  const categoria = item.categoria ?? item.categoriaDestino ?? "Gasto Pessoal (Fora da Viagem)";
  if (item.escopo === "viagem_compartilhado" && categoria === "Gasto Pessoal (Fora da Viagem)") {
    return "Outros da viagem";
  }
  return categoria;
}

/* ------------------------------- gravação ------------------------------- */

export interface NovaDespesa {
  /** Id fixo (lançamentos que precisam ser idempotentes, como os do Roteiro); sem ele, um id novo. */
  id?: string;
  descricao: string;
  valor: number;
  moeda?: string;
  cotacaoBrl?: number | null;
  data?: string; // AAAA-MM-DD
  categoria: Categoria;
  escopo: Escopo;
  pagoPor?: string | null;
  proporcaoDivisao?: number | null;
  tipo?: "gasto" | "acerto";
  origem: OrigemDespesa;
  /** Metadados da fatura importada (DuoFinance). */
  fatura?: {
    oQueFoiGasto: string;
    categoriaDetalhada: CategoriaDuoFinance;
    /** null = compra à vista. */
    parcela: { atual: number; total: number } | null;
    /** AAAA-MM; "" quando não deu para inferir. */
    referencia: string;
    /** `transaction_fingerprint` (./fingerprint); null sem Web Crypto. */
    fingerprint: string | null;
  };
}

/** Cria o gasto na fila de sincronização. null = painel ainda sem contexto. */
export function criarDespesa(nova: NovaDespesa): Despesa | null {
  const ctx = getContexto();
  if (!ctx) return null;
  // Id fixo já gravado: é o mesmo lançamento, não cria outro.
  const existente = nova.id ? getDespesas().find((d) => d.id === nova.id) : undefined;
  if (existente) return existente;
  const agora = new Date().toISOString();
  const moeda = (nova.moeda ?? "BRL").toUpperCase();
  const despesa: Despesa = {
    id: nova.id ?? idAleatorio(),
    userId: ctx.userId,
    workspaceId: ctx.workspace?.id ?? null,
    pagoPor: nova.pagoPor ?? ctx.userId,
    tipo: nova.tipo ?? "gasto",
    descricao: nova.descricao.trim().slice(0, 120) || "Despesa",
    valor: roundMoney(nova.valor),
    moeda,
    cotacaoBrl: moeda === "BRL" ? null : nova.cotacaoBrl ?? null,
    data: nova.data ?? todayInSaoPaulo(),
    categoria: nova.categoria,
    // Sem espaço do casal não há com quem compartilhar.
    escopo: ctx.workspace ? nova.escopo : "pessoal_privado",
    proporcaoDivisao: nova.proporcaoDivisao ?? null,
    origem: nova.origem,
    ...(nova.fatura && {
      oQueFoiGasto: nova.fatura.oQueFoiGasto.trim().slice(0, 120) || null,
      categoriaDetalhada: nova.fatura.categoriaDetalhada,
      parcelaAtual: nova.fatura.parcela?.atual ?? null,
      totalParcelas: nova.fatura.parcela?.total ?? null,
      faturaReferencia: /^\d{4}-(0[1-9]|1[0-2])$/.test(nova.fatura.referencia) ? nova.fatura.referencia : null,
      transactionFingerprint: nova.origem === "importacao" ? nova.fatura.fingerprint : null,
    }),
    criadoEm: agora,
    atualizadoEm: agora,
    atualizadoPor: ctx.userId,
  };
  criarRegistro("despesas", despesa);
  return despesa;
}

function brParaIso(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : todayInSaoPaulo();
}

const ORIGEM_DO_RASCUNHO: Record<string, OrigemDespesa> = {
  Nora: "nora",
  Importado: "importacao",
  Recibo: "recibo",
};

/** Grava um rascunho (proposta confirmada da Nora). */
export function adicionarDespesa(item: ItemDespesa): Despesa | null {
  return criarDespesa({
    descricao: item.estabelecimento,
    valor: item.valor,
    data: brParaIso(item.data),
    categoria: item.categoriaDestino,
    escopo: item.escopo,
    origem: ORIGEM_DO_RASCUNHO[item.origem] ?? "manual",
  });
}

export function atualizarDespesa(id: string, campos: Partial<Despesa>): void {
  atualizarRegistro("despesas", id, campos);
}

export function removerDespesa(id: string): void {
  removerRegistro("despesas", id);
}

/* -------------------------------- leitura -------------------------------- */

export function useDespesas(): Despesa[] {
  return useRegistros("despesas");
}

export function getDespesas(): Despesa[] {
  return getRegistros("despesas");
}

/** Lançamentos do acerto (gastos compartilhados + pagamentos de acerto). */
export function lancamentosDoAcerto(lista: Despesa[]): { lancamentos: LancamentoAcerto[]; semCotacao: number } {
  let semCotacao = 0;
  const lancamentos: LancamentoAcerto[] = [];
  for (const d of lista) {
    if (d.escopo !== "viagem_compartilhado") continue;
    const valorBrl = valorEmReais(d);
    if (valorBrl === null) {
      semCotacao++;
      continue;
    }
    lancamentos.push({ valorBrl, pagoPor: d.pagoPor ?? d.userId, proporcaoDivisao: d.proporcaoDivisao, tipo: d.tipo });
  }
  return { lancamentos, semCotacao };
}

/** Resumo financeiro (compartilhado, sua parte pela regra do casal, pessoal). */
export interface ResumoFinancas {
  totalCompartilhado: number;
  /** Sua parte dos gastos compartilhados pela regra combinada. */
  suaParte: number;
  /** @deprecated use `suaParte` (mantido para a Nora). */
  metade: number;
  regra: string;
  totalPrivado: number;
  qtdCompartilhado: number;
  qtdPrivado: number;
  porCategoria: { categoria: Categoria; total: number }[];
}

export function resumirDespesas(
  lista: Despesa[] = getDespesas(),
  ctx: ContextoSincronizacao | null = getContexto()
): ResumoFinancas {
  const compartilhados = lista.filter((d) => d.escopo === "viagem_compartilhado" && d.tipo === "gasto");
  const privados = lista.filter((d) => d.escopo === "pessoal_privado" && (!ctx || d.userId === ctx.userId));
  const emReais = (d: Despesa) => valorEmReais(d) ?? 0;
  const totalCompartilhado = sumMoney(compartilhados.map(emReais));
  const totalPrivado = sumMoney(privados.map(emReais));

  // Por categoria em centavos: a soma das categorias fecha com o total.
  const mapa = new Map<Categoria, number>();
  for (const d of compartilhados) mapa.set(d.categoria, (mapa.get(d.categoria) ?? 0) + toCents(emReais(d)));
  const porCategoria = [...mapa.entries()]
    .map(([categoria, total]) => ({ categoria, total: fromCents(total) }))
    .sort((a, b) => b.total - a.total);

  const regra = ctx ? regraDoAcordo(ctx.acordo) : ({ regra: "igual" } as const);
  let suaParte = fromCents(splitAmount(toCents(totalCompartilhado), 2)[0]);
  let descricao = "Divisão igual (50/50)";
  if (ctx) {
    const dono = ctx.membros.find((m) => m.papel === "dono");
    const parceiro = ctx.membros.find((m) => m.papel === "parceiro");
    const souDono = !parceiro || dono?.userId === ctx.userId;
    const membros = { dono: dono?.userId ?? ctx.userId, parceiro: parceiro?.userId ?? "__par_ainda_nao_entrou__" };
    // Só a parte (não o saldo): todos os gastos contam como pagos por alguém do casal.
    const lancamentos = compartilhados.map((d) => ({
      valorBrl: emReais(d),
      pagoPor: membros.dono,
      proporcaoDivisao: d.proporcaoDivisao === null ? null : (d.pagoPor ?? d.userId) === membros.dono ? d.proporcaoDivisao : 100 - d.proporcaoDivisao,
      tipo: "gasto" as const,
    }));
    const r = calcularAcerto(lancamentos, membros, regra);
    suaParte = souDono ? r.parte.dono : r.parte.parceiro;
    descricao = descreverRegra(regra, {
      dono: dono?.nome ?? "Você",
      parceiro: parceiro?.nome ?? "seu par",
    });
  }

  return {
    totalCompartilhado,
    suaParte,
    metade: suaParte,
    regra: descricao,
    totalPrivado,
    qtdCompartilhado: compartilhados.length,
    qtdPrivado: privados.length,
    porCategoria,
  };
}
