import { describe, expect, it } from "vitest";
import {
  codigoConviteValido,
  destinoPosConfirmacao,
  destinoSeguro,
  funcaoRpcAusente,
} from "./seguranca";

describe("destinoSeguro (sem open redirect)", () => {
  it.each(["/dashboard", "/dashboard/financas", "/dashboard/buscar-viagem/"])("aceita %s", (d) => {
    expect(destinoSeguro(d)).toBe(d);
  });

  it.each([
    "",
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "/login",
    "/dashboard/../login",
    "/dashboard?x=1",
    "javascript:alert(1)",
    "/dashboardx",
  ])("recusa %s", (d) => {
    expect(destinoSeguro(d)).toBe("/dashboard");
  });
});

describe("codigoConviteValido", () => {
  it("aceita o código hexadecimal do banco e o formato DUO-", () => {
    expect(codigoConviteValido(" 3f9a0c1b2d4e5f60 ")).toBe("3f9a0c1b2d4e5f60");
    expect(codigoConviteValido("DUO-7FK3Q2")).toBe("DUO-7FK3Q2");
  });

  it.each(["", "abc", "x".repeat(65), "codigo com espaço", "a'; drop table convites;--"])("recusa %s", (c) => {
    expect(codigoConviteValido(c)).toBeNull();
  });
});

describe("destinoPosConfirmacao", () => {
  it("mantém o convite e o painel", () => {
    expect(destinoPosConfirmacao("/convite?code=3f9a0c1b2d4e5f60")).toBe("/convite?code=3f9a0c1b2d4e5f60");
    expect(destinoPosConfirmacao("/dashboard/roteiro")).toBe("/dashboard/roteiro");
  });

  it.each(["https://evil.com", "/convite?code=x&next=//evil.com", "//evil.com"])("recusa %s", (n) => {
    expect(destinoPosConfirmacao(n)).toBe("/dashboard");
  });
});

describe("funcaoRpcAusente", () => {
  it("reconhece a função ainda não criada no Supabase", () => {
    expect(funcaoRpcAusente({ code: "PGRST202", message: "x" })).toBe(true);
    expect(
      funcaoRpcAusente({ message: "Could not find the function public.aceitar_convite(p_codigo) in the schema cache" })
    ).toBe(true);
  });

  it("outros erros não disparam o caminho antigo", () => {
    expect(funcaoRpcAusente({ code: "42501", message: "permission denied" })).toBe(false);
    expect(funcaoRpcAusente(null)).toBe(false);
  });
});
