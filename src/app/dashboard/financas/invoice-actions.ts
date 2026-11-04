"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";
import { getWorkspaceAtual } from "@/lib/supabase/workspace";
import { CATEGORIAS_DUOFINANCE } from "@/lib/finance/invoice-analyzer";

/**
 * DuoFinance — persistência das transações revisadas da fatura no Supabase.
 *
 * Grava na tabela `despesas` com RLS por workspace: cada item carrega
 * `user_id` (do getClaims) e `workspace_id` (do espaço ativo da dupla), além
 * dos metadados ricos (nome limpo, o que foi gasto, categoria, parcelas e mês
 * de referência). Os compartilhados ficam visíveis para as duas contas; os
 * privados só para o dono — exatamente como a policy `despesas_escopo` define.
 *
 * Nunca lança para o cliente: devolve sempre um resultado com mensagem PT-BR.
 */

/** Uma transação pronta para gravar (saída revisada do importador). */
const transacaoSchema = z.object({
  dataIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  descricaoOriginal: z.string().min(1).max(300),
  cleanMerchantName: z.string().min(1).max(120),
  whatWasBought: z.string().max(120),
  valor: z.number().min(0.01).max(1_000_000),
  moeda: z.string().regex(/^[A-Z]{3}$/),
  category: z.enum(CATEGORIAS_DUOFINANCE),
  suggestedScope: z.enum(["compartilhado", "pessoal_privado"]),
  isInstallment: z.boolean(),
  currentInstallment: z.number().int().min(1).max(72),
  totalInstallments: z.number().int().min(1).max(72),
  totalPurchaseAmount: z.number().min(0).max(100_000_000),
});

const payloadSchema = z.object({
  faturaReferencia: z.string().regex(/^\d{4}-\d{2}$/).or(z.literal("")),
  transacoes: z.array(transacaoSchema).min(1).max(500),
});

export type SalvarFaturaResult =
  | { ok: true; salvos: number; workspace: string; message: string }
  | { ok: false; message: string };

/** Escopo do DuoFinance → escopo do banco (coluna `escopo`). */
function escopoBanco(s: "compartilhado" | "pessoal_privado"): string {
  return s === "compartilhado" ? "viagem_compartilhado" : "pessoal_privado";
}

export async function salvarDespesasFatura(
  entrada: z.infer<typeof payloadSchema>
): Promise<SalvarFaturaResult> {
  const parse = payloadSchema.safeParse(entrada);
  if (!parse.success) {
    return { ok: false, message: "Dados da fatura inválidos. Reimporte e tente de novo." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      message: "A persistência está indisponível (Supabase não configurado). Nada foi salvo.",
    };
  }

  const userId = await getCurrentUserId(supabase);
  const ws = await getWorkspaceAtual();
  // Sem workspace não há como vincular os compartilhados à dupla com segurança.
  if (!ws) {
    return {
      ok: false,
      message: "Não foi possível preparar o espaço da dupla. Entre de novo e tente mais uma vez.",
    };
  }

  const { faturaReferencia, transacoes } = parse.data;

  const linhas = transacoes.map((t) => ({
    user_id: userId,
    workspace_id: ws.id,
    titulo: t.cleanMerchantName,
    estabelecimento: t.cleanMerchantName,
    estabelecimento_limpo: t.cleanMerchantName,
    descricao_original: t.descricaoOriginal,
    o_que_foi_gasto: t.whatWasBought,
    valor: t.valor,
    moeda: t.moeda,
    data: t.dataIso,
    categoria: t.category,
    escopo: escopoBanco(t.suggestedScope),
    origem: "fatura",
    eh_parcelado: t.isInstallment,
    parcela_atual: t.isInstallment ? t.currentInstallment : null,
    total_parcelas: t.isInstallment ? t.totalInstallments : null,
    valor_total_compra: t.isInstallment ? t.totalPurchaseAmount : null,
    fatura_referencia: faturaReferencia || null,
  }));

  const { data, error } = await supabase.from("despesas").insert(linhas).select("id");
  if (error) {
    console.error("[salvarDespesasFatura] falha ao inserir:", error.message);
    return {
      ok: false,
      message: "Não foi possível salvar os gastos agora. Tente de novo em instantes.",
    };
  }

  refresh();
  const salvos = data?.length ?? linhas.length;
  return {
    ok: true,
    salvos,
    workspace: ws.nome,
    message: `${salvos} ${salvos === 1 ? "gasto salvo" : "gastos salvos"} no DuoFinance.`,
  };
}

/* ======================================================================== */
/* Leitura das despesas persistidas (para a lista do DuoFinance)            */
/* ======================================================================== */

export interface DespesaPersistida {
  id: string;
  data: string | null;
  estabelecimento: string;
  oQueFoiGasto: string;
  valor: number;
  categoria: string;
  escopo: "viagem_compartilhado" | "pessoal_privado";
  ehParcelado: boolean;
  parcelaAtual: number | null;
  totalParcelas: number | null;
  faturaReferencia: string | null;
}

export type ListarDespesasResult =
  | { ok: true; configurado: boolean; itens: DespesaPersistida[] }
  | { ok: false; message: string };

/**
 * Lista as despesas persistidas do workspace ativo. A RLS garante que a
 * consulta só devolve o que a pessoa pode ver: seus privados e os
 * compartilhados do espaço da dupla.
 */
export async function listarDespesasPersistidas(): Promise<ListarDespesasResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: true, configurado: false, itens: [] };

  const ws = await getWorkspaceAtual();

  let query = supabase
    .from("despesas")
    .select(
      "id, data, estabelecimento, estabelecimento_limpo, titulo, o_que_foi_gasto, valor, categoria, escopo, eh_parcelado, parcela_atual, total_parcelas, fatura_referencia, created_at"
    )
    .order("data", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  // Vincula ao espaço da dupla quando houver; a RLS cobre o resto.
  if (ws) query = query.eq("workspace_id", ws.id);

  const { data, error } = await query;
  if (error) {
    console.error("[listarDespesasPersistidas]", error.message);
    return { ok: false, message: "Não foi possível carregar os gastos salvos." };
  }

  const itens: DespesaPersistida[] = (data ?? []).map((row) => ({
    id: String(row.id),
    data: typeof row.data === "string" ? row.data : null,
    estabelecimento: String(row.estabelecimento_limpo || row.estabelecimento || row.titulo || "Despesa"),
    oQueFoiGasto: typeof row.o_que_foi_gasto === "string" ? row.o_que_foi_gasto : "",
    valor: Number(row.valor) || 0,
    categoria: typeof row.categoria === "string" ? row.categoria : "Outros",
    escopo: row.escopo === "pessoal_privado" ? "pessoal_privado" : "viagem_compartilhado",
    ehParcelado: Boolean(row.eh_parcelado),
    parcelaAtual: row.parcela_atual == null ? null : Number(row.parcela_atual),
    totalParcelas: row.total_parcelas == null ? null : Number(row.total_parcelas),
    faturaReferencia: typeof row.fatura_referencia === "string" ? row.fatura_referencia : null,
  }));

  return { ok: true, configurado: true, itens };
}
