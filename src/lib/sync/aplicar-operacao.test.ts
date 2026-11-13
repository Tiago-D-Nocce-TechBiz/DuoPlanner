import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { aplicarLote } from "./aplicar-operacao";
import type { OperacaoBruta } from "./esquemas";

/**
 * Cliente PostgREST falso: registra cada chamada (tabela, ação, linhas,
 * filtros) e responde pelo `responder` do teste. Só o que `aplicarLote` usa.
 */
type Chamada = {
  tabela: string;
  acao: "insert" | "delete" | "update" | "select";
  linhas?: Record<string, unknown>[];
  filtros: [string, string, unknown][];
};
type Resposta = { data: unknown; error: { code?: string; message?: string } | null };

function clienteFalso(responder: (c: Chamada) => Resposta) {
  const chamadas: Chamada[] = [];
  const from = (tabela: string) => {
    const chamada: Chamada = { tabela, acao: "select", filtros: [] };
    const builder = {
      insert(linhas: Record<string, unknown> | Record<string, unknown>[]) {
        chamada.acao = "insert";
        chamada.linhas = Array.isArray(linhas) ? linhas : [linhas];
        return builder;
      },
      delete() {
        chamada.acao = "delete";
        return builder;
      },
      update(linha: Record<string, unknown>) {
        chamada.acao = "update";
        chamada.linhas = [linha];
        return builder;
      },
      select() {
        return builder;
      },
      eq(coluna: string, valor: unknown) {
        chamada.filtros.push(["eq", coluna, valor]);
        return builder;
      },
      in(coluna: string, valores: unknown[]) {
        chamada.filtros.push(["in", coluna, valores]);
        return builder;
      },
      single: () => builder,
      maybeSingle: () => builder,
      then(ok: (r: Resposta) => unknown, falhou?: (e: unknown) => unknown) {
        chamadas.push(chamada);
        return Promise.resolve(responder(chamada)).then(ok, falhou);
      },
    };
    return builder;
  };
  return { cliente: { from } as unknown as SupabaseClient, chamadas };
}

const EU = "11111111-1111-4111-8111-111111111111";
const ESPACO = { id: "33333333-3333-4333-8333-333333333333" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function criarGasto(n: number, extra: Record<string, unknown> = {}): OperacaoBruta {
  return {
    opId: `op-${n}`,
    tipo: "criar",
    recurso: "despesas",
    registro: {
      id: uuid(n),
      descricao: `Compra ${n}`,
      valor: 10 + n,
      moeda: "BRL",
      cotacaoBrl: null,
      data: "2026-10-01",
      categoria: "Alimentação & Gastronomia",
      escopo: "viagem_compartilhado",
      pagoPor: null,
      proporcaoDivisao: null,
      tipo: "gasto",
      origem: "importacao",
      ...extra,
    },
  };
}

/** Linha "gravada" que o banco devolveria para a linha enviada. */
const comoGravada = (l: Record<string, unknown>) => ({ ...l, criado_em: "2026-11-12T10:00:00Z", atualizado_em: "2026-11-12T10:00:00Z" });

describe("aplicarLote: sem uma ida ao banco por operação", () => {
  it("25 compras de uma fatura: UM insert, cada operação com o seu registro", async () => {
    const { cliente, chamadas } = clienteFalso((c) => ({ data: c.linhas!.map(comoGravada), error: null }));
    const ops = Array.from({ length: 25 }, (_, i) => criarGasto(i + 1));
    const r = await aplicarLote(cliente, EU, ESPACO, ops);

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ tabela: "despesas_viagem", acao: "insert" });
    expect(chamadas[0].linhas).toHaveLength(25);
    // user_id, workspace_id e pago_por saem da sessão, não do cliente.
    expect(chamadas[0].linhas!.every((l) => l.user_id === EU && l.workspace_id === ESPACO.id && l.pago_por === EU)).toBe(true);
    expect(r.indisponivel).toBe(false);
    expect(r.resultados.map((x) => x.opId)).toEqual(ops.map((o) => o.opId));
    expect(r.resultados.every((x) => x.status === "aplicada" && "registro" in x && x.registro)).toBe(true);
  });

  it("a ordem da fila vale entre grupos: dias antes dos itens que apontam para eles", async () => {
    const { cliente, chamadas } = clienteFalso((c) => ({ data: (c.linhas ?? []).map(comoGravada), error: null }));
    const dia = (n: number): OperacaoBruta => ({ opId: `d${n}`, tipo: "criar", recurso: "roteiro_dias", registro: { id: uuid(100 + n), data: null, ordem: n } });
    const item = (n: number): OperacaoBruta => ({
      opId: `i${n}`,
      tipo: "criar",
      recurso: "roteiro_itens",
      registro: { id: uuid(200 + n), diaId: uuid(101), horario: "", titulo: `Atividade ${n}`, nota: "", ordem: n },
    });
    await aplicarLote(cliente, EU, ESPACO, [dia(1), dia(2), item(1), item(2), item(3)]);
    expect(chamadas.map((c) => [c.tabela, c.linhas?.length])).toEqual([
      ["roteiro_dias", 2],
      ["roteiro_itens", 3],
    ]);
  });

  it("remoções seguidas: UM delete com in(ids)", async () => {
    const { cliente, chamadas } = clienteFalso(() => ({ data: null, error: null }));
    const ops: OperacaoBruta[] = [1, 2, 3].map((n) => ({ opId: `r${n}`, tipo: "remover", recurso: "checklist", id: uuid(n) }));
    const r = await aplicarLote(cliente, EU, ESPACO, ops);
    expect(chamadas).toEqual([{ tabela: "checklist_itens", acao: "delete", filtros: [["in", "id", [uuid(1), uuid(2), uuid(3)]]] }]);
    expect(r.resultados.map((x) => x.status)).toEqual(["aplicada", "aplicada", "aplicada"]);
  });

  it("uma compra inválida sai com o próprio motivo; as outras vão juntas", async () => {
    const { cliente, chamadas } = clienteFalso((c) => ({ data: c.linhas!.map(comoGravada), error: null }));
    const r = await aplicarLote(cliente, EU, ESPACO, [criarGasto(1), criarGasto(2, { valor: -5 }), criarGasto(3)]);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].linhas!.map((l) => l.descricao)).toEqual(["Compra 1", "Compra 3"]);
    expect(r.resultados.map((x) => [x.opId, x.status])).toEqual([
      ["op-1", "aplicada"],
      ["op-2", "rejeitada"],
      ["op-3", "aplicada"],
    ]);
  });

  it("duplicata no insert em massa (23505): refaz uma a uma e cada uma recebe o seu resultado", async () => {
    // A compra 2 já existe com outro id (mesma compra da fatura, outro aparelho).
    const { cliente, chamadas } = clienteFalso((c) => {
      if (c.acao === "insert" && c.linhas!.length > 1) return { data: null, error: { code: "23505", message: "duplicate key" } };
      if (c.acao === "insert") {
        return c.linhas![0].descricao === "Compra 2"
          ? { data: null, error: { code: "23505", message: "duplicate key" } }
          : { data: comoGravada(c.linhas![0]), error: null };
      }
      return { data: null, error: null }; // select do id: não existe
    });
    const ops = [criarGasto(1), criarGasto(2, { transactionFingerprint: `v1:${"a".repeat(64)}` }), criarGasto(3)];
    const r = await aplicarLote(cliente, EU, ESPACO, ops);
    expect(chamadas[0].linhas).toHaveLength(3);
    expect(r.resultados.map((x) => [x.opId, x.status, "motivo" in x ? x.motivo : null])).toEqual([
      ["op-1", "aplicada", null],
      ["op-2", "rejeitada", "duplicado"],
      ["op-3", "aplicada", null],
    ]);
  });

  it("falha temporária no insert em massa: o grupo inteiro espera, sem repetir uma a uma", async () => {
    const { cliente, chamadas } = clienteFalso(() => ({ data: null, error: { code: "57014", message: "statement timeout" } }));
    const r = await aplicarLote(cliente, EU, ESPACO, [criarGasto(1), criarGasto(2)]);
    expect(chamadas).toHaveLength(1);
    expect(r.resultados.map((x) => x.status)).toEqual(["adiada", "adiada"]);
  });

  it("banco sem a tabela: para e avisa (o resto da fila fica no aparelho)", async () => {
    const { cliente } = clienteFalso(() => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }));
    const r = await aplicarLote(cliente, EU, ESPACO, [criarGasto(1), criarGasto(2)]);
    expect(r).toEqual({ indisponivel: true, resultados: [] });
  });

  it("atualizações continuam uma a uma (cada uma tem campos próprios)", async () => {
    const { cliente, chamadas } = clienteFalso((c) => ({ data: { id: c.filtros[0][2], texto: "x", categoria: "c", feito: true, ordem: 0 }, error: null }));
    const ops: OperacaoBruta[] = [1, 2].map((n) => ({ opId: `u${n}`, tipo: "atualizar", recurso: "checklist", id: uuid(n), campos: { feito: true } }));
    const r = await aplicarLote(cliente, EU, ESPACO, ops);
    expect(chamadas.map((c) => c.acao)).toEqual(["update", "update"]);
    expect(r.resultados.map((x) => x.status)).toEqual(["aplicada", "aplicada"]);
  });

  it("sem espaço do casal: itens do espaço são recusados sem tocar no banco", async () => {
    const { cliente, chamadas } = clienteFalso(() => ({ data: [], error: null }));
    const ops: OperacaoBruta[] = [1, 2].map((n) => ({
      opId: `c${n}`,
      tipo: "criar",
      recurso: "checklist",
      registro: { id: uuid(n), texto: `Item ${n}`, categoria: "Mão / Essenciais", feito: false, ordem: n },
    }));
    const r = await aplicarLote(cliente, EU, null, ops);
    expect(chamadas).toHaveLength(0);
    expect(r.resultados.map((x) => ("motivo" in x ? x.motivo : x.status))).toEqual(["sem_espaco", "sem_espaco"]);
  });
});
