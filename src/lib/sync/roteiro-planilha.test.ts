import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { aplicarLote } from "./aplicar-operacao";
import { ESQUEMAS_ATUALIZAR, ESQUEMAS_CRIAR, paraColunas, roteiroItemCriar, type OperacaoBruta } from "./esquemas";
import { COLUNAS, roteiroDiaDaLinha, roteiroItemDaLinha } from "./modelos";

/**
 * Os campos novos do Roteiro (planilha e curadoria da Nora) na camada de
 * sincronização: validação, mapeamento para colunas, leitura da linha do
 * banco e o tratamento de duplicata pela impressão digital.
 */

const EU = "11111111-1111-4111-8111-111111111111";
const ESPACO = { id: "33333333-3333-4333-8333-333333333333" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const FP = (c: string) => `r1:${c.repeat(64)}`;

const ITEM_BASE = { id: uuid(1), diaId: uuid(2), horario: "", titulo: "Bondinho 28", nota: "", ordem: 0 };

describe("esquemas do item do roteiro", () => {
  it("atividade antiga (sem campos novos) continua valendo", () => {
    expect(roteiroItemCriar.safeParse(ITEM_BASE).success).toBe(true);
  });

  it("aceita turno, categoria, custo, origem e impressão digital de uma atividade importada", () => {
    const lido = roteiroItemCriar.parse({ ...ITEM_BASE, turno: "manha", categoria: "Passeio", custoEstimado: 25.005, origem: "planilha", fingerprint: FP("a") });
    expect(lido).toMatchObject({ turno: "manha", categoria: "Passeio", origem: "planilha", fingerprint: FP("a") });
    expect(lido.custoEstimado).toBe(25.01); // ao centavo
  });

  it("recusa turno inválido, custo negativo ou acima do teto, origem desconhecida e impressão digital fora do formato", () => {
    for (const ruim of [
      { turno: "madrugada" },
      { custoEstimado: -1 },
      { custoEstimado: 1_000_001 },
      { origem: "robo" },
      { origem: "planilha", fingerprint: "v1:" + "a".repeat(64) },
      { origem: "planilha", fingerprint: "r1:xyz" },
      { categoria: "x".repeat(41) },
    ]) {
      expect(roteiroItemCriar.safeParse({ ...ITEM_BASE, ...ruim }).success, JSON.stringify(ruim)).toBe(false);
    }
  });

  it("impressão digital só em atividade da planilha ou da Nora (o banco também exige)", () => {
    expect(roteiroItemCriar.safeParse({ ...ITEM_BASE, fingerprint: FP("a") }).success).toBe(false);
    expect(roteiroItemCriar.safeParse({ ...ITEM_BASE, origem: "manual", fingerprint: FP("a") }).success).toBe(false);
    expect(roteiroItemCriar.safeParse({ ...ITEM_BASE, origem: "nora_sugestao", fingerprint: FP("a") }).success).toBe(true);
  });

  it("a atualização edita categoria, turno e custo, mas nunca a origem nem a impressão digital", () => {
    const lido = ESQUEMAS_ATUALIZAR.roteiro_itens.parse({ categoria: "Praia", turno: null, custoEstimado: 10, origem: "planilha", fingerprint: FP("b"), titulo: "x" });
    expect(lido).toEqual({ categoria: "Praia", turno: null, custoEstimado: 10, titulo: "x" });
    expect(paraColunas("roteiro_itens", lido as Record<string, unknown>)).toEqual({ categoria: "Praia", turno: null, custo_estimado: 10, titulo: "x" });
  });

  it("um campo omitido na atualização não vira valor padrão", () => {
    expect(ESQUEMAS_ATUALIZAR.roteiro_itens.parse({ titulo: "x" })).toEqual({ titulo: "x" });
  });

  it("o dia aceita destino (até 80) e a atualização também", () => {
    expect(ESQUEMAS_CRIAR.roteiro_dias.safeParse({ id: uuid(3), data: "2026-09-10", destino: "Lisboa", ordem: 0 }).success).toBe(true);
    expect(ESQUEMAS_CRIAR.roteiro_dias.safeParse({ id: uuid(3), data: null, ordem: 0 }).success).toBe(true);
    expect(ESQUEMAS_CRIAR.roteiro_dias.safeParse({ id: uuid(3), data: null, destino: "x".repeat(81), ordem: 0 }).success).toBe(false);
    expect(ESQUEMAS_ATUALIZAR.roteiro_dias.parse({ destino: "Porto" })).toEqual({ destino: "Porto" });
  });
});

describe("colunas e leitura da linha", () => {
  it("lê explicitamente as colunas novas (sem SELECT *)", () => {
    expect(COLUNAS.roteiro_itens).not.toContain("*");
    for (const c of ["turno", "categoria", "custo_estimado", "origem", "fingerprint"]) expect(COLUNAS.roteiro_itens).toContain(c);
    expect(COLUNAS.roteiro_dias).toContain("destino");
  });

  it("converte a linha do banco (custo pode chegar como texto) e tolera linhas antigas", () => {
    expect(
      roteiroItemDaLinha({ id: "i", dia_id: "d", horario: "", titulo: "Praia", descricao: "n", turno: "tarde", categoria: "Praia", custo_estimado: "12.50", origem: "nora_sugestao", fingerprint: FP("c"), ordem: 1 })
    ).toMatchObject({ turno: "tarde", categoria: "Praia", custoEstimado: 12.5, origem: "nora_sugestao", fingerprint: FP("c") });
    const antiga = roteiroItemDaLinha({ id: "i", dia_id: "d", horario: "", titulo: "x", descricao: "", ordem: 0 });
    expect(antiga).toMatchObject({ turno: null, categoria: null, custoEstimado: null, origem: "manual", fingerprint: null });
    expect(roteiroItemDaLinha({ id: "i", turno: "lixo", origem: "lixo", fingerprint: "lixo" })).toMatchObject({ turno: null, origem: "manual", fingerprint: null });
    expect(roteiroDiaDaLinha({ id: "d", data: "2026-09-10T00:00:00", destino: "Lisboa", ordem: 0 }).destino).toBe("Lisboa");
    expect(roteiroDiaDaLinha({ id: "d", ordem: 0 }).destino).toBeNull();
  });
});

type Chamada = { tabela: string; acao: "insert" | "select"; linhas?: Record<string, unknown>[] };
type Resposta = { data: unknown; error: { code?: string; message?: string } | null };

function clienteFalso(responder: (c: Chamada) => Resposta) {
  const chamadas: Chamada[] = [];
  const from = (tabela: string) => {
    const chamada: Chamada = { tabela, acao: "select" };
    const b = {
      insert(linhas: Record<string, unknown> | Record<string, unknown>[]) {
        chamada.acao = "insert";
        chamada.linhas = Array.isArray(linhas) ? linhas : [linhas];
        return b;
      },
      select: () => b,
      eq: () => b,
      single: () => b,
      maybeSingle: () => b,
      then(ok: (r: Resposta) => unknown, falhou?: (e: unknown) => unknown) {
        chamadas.push(chamada);
        return Promise.resolve(responder(chamada)).then(ok, falhou);
      },
    };
    return b;
  };
  return { cliente: { from } as unknown as SupabaseClient, chamadas };
}

const criarItem = (n: number, extra: Record<string, unknown> = {}): OperacaoBruta => ({
  opId: `op-${n}`,
  tipo: "criar",
  recurso: "roteiro_itens",
  registro: { id: uuid(100 + n), diaId: uuid(2), horario: "", titulo: `Atividade ${n}`, nota: "", ordem: n, origem: "planilha", fingerprint: FP(String(n % 10)), ...extra },
});

describe("gravação em lote do roteiro importado", () => {
  it("25 atividades viram UM insert, no espaço da sessão, com as colunas novas mapeadas", async () => {
    const { cliente, chamadas } = clienteFalso((c) => ({ data: (c.linhas ?? []).map((l) => ({ ...l, atualizado_em: "2026-05-01T00:00:00Z" })), error: null }));
    const ops = Array.from({ length: 25 }, (_, i) => criarItem(i + 1, { turno: "manha", categoria: "Passeio", custoEstimado: 10 }));
    const r = await aplicarLote(cliente, EU, ESPACO, ops);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].tabela).toBe("roteiro_itens");
    expect(chamadas[0].linhas).toHaveLength(25);
    expect(chamadas[0].linhas![0]).toMatchObject({
      workspace_id: ESPACO.id,
      dia_id: uuid(2),
      turno: "manha",
      categoria: "Passeio",
      custo_estimado: 10,
      origem: "planilha",
      fingerprint: FP("1"),
    });
    expect(chamadas[0].linhas![0]).not.toHaveProperty("user_id");
    expect(r.resultados.every((x) => x.status === "aplicada")).toBe(true);
  });

  it("a mesma atividade importada por outro aparelho (impressão digital repetida) é descartada em silêncio", async () => {
    const { cliente } = clienteFalso((c) => {
      if (c.acao === "insert") {
        const duplicada = c.linhas!.length > 1 || c.linhas![0].titulo === "Atividade 2";
        return duplicada ? { data: null, error: { code: "23505", message: "duplicate key" } } : { data: [{ ...c.linhas![0], atualizado_em: "x" }], error: null };
      }
      return { data: null, error: null }; // o id não existe: é outra linha com a mesma impressão digital
    });
    const r = await aplicarLote(cliente, EU, ESPACO, [criarItem(1), criarItem(2), criarItem(3)]);
    expect(r.resultados.map((x) => [x.opId, x.status, "motivo" in x ? x.motivo : null])).toEqual([
      ["op-1", "aplicada", null],
      ["op-2", "rejeitada", "duplicado"],
      ["op-3", "aplicada", null],
    ]);
  });

  it("reenvio da mesma criação (resposta perdida) continua idempotente", async () => {
    const existente = { id: uuid(101), dia_id: uuid(2), titulo: "Atividade 1", descricao: "", horario: "", ordem: 1, origem: "planilha", fingerprint: FP("1") };
    const { cliente } = clienteFalso((c) =>
      c.acao === "insert" ? { data: null, error: { code: "23505", message: "dup" } } : { data: existente, error: null }
    );
    const r = await aplicarLote(cliente, EU, ESPACO, [criarItem(1)]);
    expect(r.resultados[0]).toMatchObject({ status: "aplicada", registro: { id: uuid(101), fingerprint: FP("1") } });
  });
});
