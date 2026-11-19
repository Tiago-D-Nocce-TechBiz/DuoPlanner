import { describe, expect, it, vi } from "vitest";
import { CONTEXTO_VAZIO, type ResultadoAdvisor } from "@/lib/ai/nora-strategies";
import { consultarComFallback } from "./nora-consulta";

const ok: ResultadoAdvisor = { tipo: "pergunta", estrategia: "auditoria_voo", pergunta: "Qual destino?", contexto: CONTEXTO_VAZIO };

describe("consultarComFallback", () => {
  it("devolve o resultado da Server Action quando deu certo", async () => {
    const consultar = vi.fn(async () => ({ success: true as const, data: ok }));
    await expect(consultarComFallback("auditoria_voo", "texto", consultar)).resolves.toBe(ok);
    expect(consultar).toHaveBeenCalledWith({ estrategia: "auditoria_voo", texto: "texto" });
  });

  it("falha prevista da ação vira a lista local com a mensagem", async () => {
    const r = await consultarComFallback("auditoria_voo", "", async () => ({ success: false, code: "ERRO_INTERNO", error: "Algo deu errado." }));
    expect(r).toMatchObject({ tipo: "analise", origem: "local", aviso: "Algo deu errado." });
  });

  it("sem login, orienta a entrar", async () => {
    const r = await consultarComFallback("auditoria_voo", "", async () => ({ success: false, code: "NAO_AUTENTICADO", error: "x" }));
    expect(r.tipo === "analise" && r.aviso).toContain("Entre na sua conta");
  });

  it("sem conexão (a chamada lança), cai na lista local", async () => {
    const r = await consultarComFallback("verificacao_taxas", "", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r).toMatchObject({ tipo: "analise", origem: "local", estrategia: "verificacao_taxas" });
    expect(r.tipo === "analise" && r.aviso).toContain("Sem conexão");
  });
});
