import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gravarHistoricoDePrecos, linhaDeHistorico } from "./alertas-preco";

vi.mock("server-only", () => ({}));

const ALERTA = { id: "00000000-0000-4000-8000-000000000001", workspaceId: "00000000-0000-4000-8000-000000000002" };

describe("linhaDeHistorico", () => {
  it("monta a linha do dia com o preço ao centavo", () => {
    expect(linhaDeHistorico(ALERTA, 1234.567, "2026-09-10", "2026-09-10T11:00:00Z")).toEqual({
      alerta_id: ALERTA.id,
      workspace_id: ALERTA.workspaceId,
      dia: "2026-09-10",
      preco: 1234.57,
      verificado_em: "2026-09-10T11:00:00Z",
    });
  });

  it("não grava alerta sem espaço do casal, nem preço que a CHECK da tabela recusaria", () => {
    expect(linhaDeHistorico({ ...ALERTA, workspaceId: null }, 100, "2026-09-10", "x")).toBeNull();
    for (const invalido of [0, -1, Number.NaN, Infinity, 10_000_001]) expect(linhaDeHistorico(ALERTA, invalido, "2026-09-10", "x"), String(invalido)).toBeNull();
    expect(linhaDeHistorico(ALERTA, 10_000_000, "2026-09-10", "x")).not.toBeNull();
  });
});

describe("gravarHistoricoDePrecos", () => {
  const linhas = [1, 2, 3].map((n) => linhaDeHistorico({ id: `00000000-0000-4000-8000-00000000010${n}`, workspaceId: ALERTA.workspaceId }, 100 * n, "2026-09-10", "t")!);
  let upsert: ReturnType<typeof vi.fn>;
  let admin: SupabaseClient;
  const montar = (erro: { code?: string; message?: string } | null) => {
    upsert = vi.fn(async () => ({ error: erro }));
    const from = vi.fn(() => ({ upsert }));
    admin = { from } as unknown as SupabaseClient;
    return from;
  };
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

  it("grava todos os alertas numa só chamada, por alerta e dia (sem N+1)", async () => {
    const from = montar(null);
    expect(await gravarHistoricoDePrecos(admin, linhas)).toBe("gravado");
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("alertas_preco_historico");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(linhas, { onConflict: "alerta_id,dia" });
  });

  it("sem linhas, nem toca no banco", async () => {
    const from = montar(null);
    expect(await gravarHistoricoDePrecos(admin, [])).toBe("vazio");
    expect(from).not.toHaveBeenCalled();
  });

  it("banco sem a migration do histórico não é erro", async () => {
    montar({ code: "42P01", message: 'relation "alertas_preco_historico" does not exist' });
    expect(await gravarHistoricoDePrecos(admin, linhas)).toBe("sem_tabela");
  });

  it("outro erro é registrado e sinalizado, sem lançar", async () => {
    montar({ code: "57014", message: "timeout" });
    expect(await gravarHistoricoDePrecos(admin, linhas)).toBe("falhou");
  });
});
