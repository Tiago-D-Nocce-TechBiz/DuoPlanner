import { z } from "zod";
import { CATEGORIAS, ESCOPOS } from "@/lib/finance/classificar";
import { ORIGENS_DESPESA, RECURSOS, type Recurso } from "./modelos";

/**
 * Validação das operações de sincronização (fronteira de confiança).
 *
 * O cliente envia operações "criar / atualizar / remover" por recurso. O
 * servidor valida cada uma com estes esquemas (espelho das CHECKs do banco) e
 * monta a linha só com os campos permitidos — `user_id` e `workspace_id`
 * vêm SEMPRE da sessão, nunca do cliente.
 */

const uuid = z.uuid();
const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Data inválida.");
const centavos = (v: number) => Math.round(v * 100) / 100;
const iata = z.string().regex(/^[A-Z]{3}$/).nullable();
const horario = z.string().regex(/^(|([01]\d|2[0-3]):[0-5]\d)$/, "Horário inválido.");

/* -------------------------------- despesas -------------------------------- */

const despesaCampos = z.object({
  descricao: z.string().trim().min(1, "Informe uma descrição.").max(120),
  valor: z.number().positive("O valor precisa ser maior que zero.").max(1_000_000).transform(centavos),
  moeda: z.string().regex(/^[A-Z]{3}$/),
  cotacaoBrl: z.number().positive().max(100_000).nullable(),
  data: dataIso,
  categoria: z.enum(CATEGORIAS),
  escopo: z.enum(ESCOPOS),
  pagoPor: uuid.nullable(),
  proporcaoDivisao: z.number().min(0).max(100).nullable(),
});

export const despesaCriar = despesaCampos
  .extend({
    id: uuid,
    tipo: z.enum(["gasto", "acerto"]),
    origem: z.enum(ORIGENS_DESPESA),
  })
  .superRefine((d, ctx) => {
    if (d.moeda !== "BRL" && !d.cotacaoBrl) {
      ctx.addIssue({ code: "custom", path: ["cotacaoBrl"], message: "Informe a cotação da moeda estrangeira." });
    }
    if (d.tipo === "acerto" && (d.escopo !== "viagem_compartilhado" || d.proporcaoDivisao !== 0)) {
      ctx.addIssue({ code: "custom", path: ["tipo"], message: "Acerto inválido." });
    }
  });

export const despesaAtualizar = despesaCampos.partial();

/* --------------------------------- roteiro -------------------------------- */

export const roteiroDiaCriar = z.object({
  id: uuid,
  data: dataIso.nullable(),
  ordem: z.number().int().min(0).max(10_000),
});
export const roteiroDiaAtualizar = roteiroDiaCriar.omit({ id: true }).partial();

export const roteiroItemCriar = z.object({
  id: uuid,
  diaId: uuid,
  horario,
  titulo: z.string().max(120),
  nota: z.string().max(500),
  ordem: z.number().int().min(0).max(10_000),
});
export const roteiroItemAtualizar = roteiroItemCriar.omit({ id: true, diaId: true }).partial();

/* -------------------------------- checklist ------------------------------- */

export const checklistCriar = z.object({
  id: uuid,
  texto: z.string().trim().min(1, "Descreva o item.").max(120),
  categoria: z.string().trim().min(1).max(40),
  feito: z.boolean(),
  ordem: z.number().int().min(0).max(10_000),
});
export const checklistAtualizar = checklistCriar.omit({ id: true }).partial();

/* --------------------------------- alertas -------------------------------- */

const alertaCampos = z.object({
  tipo: z.enum(["voo", "hospedagem"]),
  origem: z.string().trim().max(80),
  origemIata: iata,
  destino: z.string().trim().min(2, "Informe o destino.").max(80),
  destinoIata: iata,
  ida: dataIso,
  volta: dataIso.nullable(),
  adultos: z.number().int().min(1).max(9),
  precoAlvo: z.number().positive().max(1_000_000).transform(centavos).nullable(),
  ativo: z.boolean(),
});

const regrasAlerta = (a: Partial<z.infer<typeof alertaCampos>>, ctx: z.RefinementCtx) => {
  if (a.ida && a.volta && a.volta < a.ida) {
    ctx.addIssue({ code: "custom", path: ["volta"], message: "A volta precisa ser depois da ida." });
  }
  if (a.tipo === "hospedagem" && a.volta === null) {
    ctx.addIssue({ code: "custom", path: ["volta"], message: "Informe o check-out." });
  }
};

export const alertaCriar = alertaCampos.extend({ id: uuid }).superRefine(regrasAlerta);
export const alertaAtualizar = alertaCampos.partial().superRefine(regrasAlerta);

/* -------------------------------- envelope -------------------------------- */

export const ESQUEMAS_CRIAR = {
  despesas: despesaCriar,
  roteiro_dias: roteiroDiaCriar,
  roteiro_itens: roteiroItemCriar,
  checklist: checklistCriar,
  alertas: alertaCriar,
} as const satisfies Record<Recurso, z.ZodType>;

export const ESQUEMAS_ATUALIZAR = {
  despesas: despesaAtualizar,
  roteiro_dias: roteiroDiaAtualizar,
  roteiro_itens: roteiroItemAtualizar,
  checklist: checklistAtualizar,
  alertas: alertaAtualizar,
} as const satisfies Record<Recurso, z.ZodType>;

const opId = z.string().min(1).max(64);
const recurso = z.enum(RECURSOS as [Recurso, ...Recurso[]]);

export const esquemaOperacao = z.discriminatedUnion("tipo", [
  z.object({ opId, tipo: z.literal("criar"), recurso, registro: z.record(z.string(), z.unknown()) }),
  z.object({ opId, tipo: z.literal("atualizar"), recurso, id: uuid, campos: z.record(z.string(), z.unknown()) }),
  z.object({ opId, tipo: z.literal("remover"), recurso, id: uuid }),
]);

export type OperacaoBruta = z.infer<typeof esquemaOperacao>;

export const MAX_OPERACOES_POR_LOTE = 100;

export const esquemaLote = z.object({
  ops: z.array(z.unknown()).min(1).max(MAX_OPERACOES_POR_LOTE),
});

/* ----------------------- domínio (camelCase) → colunas ----------------------- */

const COLUNA_DO_CAMPO: Record<Recurso, Record<string, string>> = {
  despesas: {
    id: "id",
    descricao: "descricao",
    valor: "valor",
    moeda: "moeda",
    cotacaoBrl: "cotacao_brl",
    data: "data",
    categoria: "categoria",
    escopo: "escopo",
    pagoPor: "pago_por",
    proporcaoDivisao: "proporcao_divisao",
    tipo: "tipo",
    origem: "origem",
  },
  roteiro_dias: { id: "id", data: "data", ordem: "ordem" },
  roteiro_itens: { id: "id", diaId: "dia_id", horario: "horario", titulo: "titulo", nota: "descricao", ordem: "ordem" },
  checklist: { id: "id", texto: "texto", categoria: "categoria", feito: "feito", ordem: "ordem" },
  alertas: {
    id: "id",
    tipo: "tipo",
    origem: "origem",
    origemIata: "origem_iata",
    destino: "destino",
    destinoIata: "destino_iata",
    ida: "ida",
    volta: "volta",
    adultos: "adultos",
    precoAlvo: "preco_alvo",
    ativo: "ativo",
  },
};

/** Converte campos JÁ VALIDADOS em colunas do banco (só as permitidas). */
export function paraColunas(recurso: Recurso, campos: Record<string, unknown>): Record<string, unknown> {
  const mapa = COLUNA_DO_CAMPO[recurso];
  const linha: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(campos)) {
    const coluna = mapa[campo];
    if (coluna && valor !== undefined) linha[coluna] = valor;
  }
  return linha;
}

/** Recursos cujo registro pertence ao usuário (user_id) além do espaço. */
export const RECURSOS_COM_DONO: readonly Recurso[] = ["despesas", "alertas"];
