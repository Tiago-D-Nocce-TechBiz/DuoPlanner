import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { DIAS_DE_HISTORICO, lerHistoricoDoAlerta } from "./historico-leitura";

vi.mock("server-only", () => ({}));

function cliente(resposta: { data: unknown; error: { code?: string; message?: string } | null }) {
  const chamadas: { tabela?: string; colunas?: string; filtros: [string, unknown][]; ordem?: [string, unknown]; limite?: number } = { filtros: [] };
  const q: Record<string, unknown> = {};
  q.select = (c: string) => ((chamadas.colunas = c), q);
  q.eq = (k: string, v: unknown) => (chamadas.filtros.push([k, v]), q);
  q.order = (c: string, o: unknown) => ((chamadas.ordem = [c, o]), q);
  q.limit = (n: number) => ((chamadas.limite = n), q);
  q.then = (ok: (v: unknown) => unknown) => ok(resposta);
  return { supabase: { from: (t: string) => ((chamadas.tabela = t), q) } as unknown as SupabaseClient, chamadas };
}

describe("lerHistoricoDoAlerta", () => {
  it("consulta com colunas nomeadas, filtro do alerta, mais recentes primeiro e teto", async () => {
    const { supabase, chamadas } = cliente({ data: [{ dia: "2026-09-03", preco: "900.50" }, { dia: "2026-09-02", preco: 1000 }], error: null });
    const r = await lerHistoricoDoAlerta(supabase, "alerta-1");
    expect(chamadas).toMatchObject({ tabela: "alertas_preco_historico", colunas: "dia, preco", filtros: [["alerta_id", "alerta-1"]], limite: DIAS_DE_HISTORICO });
    expect(chamadas.colunas).not.toContain("*");
    expect(chamadas.ordem).toEqual(["dia", { ascending: false }]);
    // Entrega em ordem cronológica, com o preço do banco (texto) convertido.
    expect(r).toEqual([{ dia: "2026-09-02", preco: 1000 }, { dia: "2026-09-03", preco: 900.5 }]);
  });

  it("sem linhas, lista vazia", async () => {
    expect(await lerHistoricoDoAlerta(cliente({ data: null, error: null }).supabase, "a")).toEqual([]);
  });

  it("banco sem a migration: indisponível, sem lançar", async () => {
    expect(await lerHistoricoDoAlerta(cliente({ data: null, error: { code: "42P01", message: 'relation "x" does not exist' } }).supabase, "a")).toBe("indisponivel");
    expect(await lerHistoricoDoAlerta(cliente({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }).supabase, "a")).toBe("indisponivel");
  });

  it("outro erro do banco é lançado (a action devolve ERRO_INTERNO sem detalhes)", async () => {
    await expect(lerHistoricoDoAlerta(cliente({ data: null, error: { code: "57014", message: "timeout" } }).supabase, "a")).rejects.toThrow("histórico de preços");
  });
});
