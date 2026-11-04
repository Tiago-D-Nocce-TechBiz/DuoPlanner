import { describe, expect, it } from "vitest";
import { operacoesDoLegado } from "./importacao";
import type { DadosLegados } from "./legado";

let n = 0;
const ctx = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  hoje: "2026-11-04",
  agora: "2026-11-04T12:00:00.000Z",
  novoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
};

const vazio: DadosLegados = { despesas: [], roteiro: [], checklist: [], documentos: [], alertas: [] };

describe("operacoesDoLegado", () => {
  it("converte gastos antigos (data BR → ISO, quem pagou = quem importa)", () => {
    const { operacoes } = operacoesDoLegado(
      { ...vazio, despesas: [{ id: "x", data: "05/10/2026", estabelecimento: "Jantar", valor: 120.5, categoriaDestino: "Alimentação & Gastronomia", escopo: "viagem_compartilhado", origem: "Manual" }] },
      ctx
    );
    expect(operacoes).toHaveLength(1);
    expect(operacoes[0]).toMatchObject({
      tipo: "criar",
      recurso: "despesas",
      registro: { data: "2026-10-05", pagoPor: ctx.userId, escopo: "viagem_compartilhado", origem: "legado", moeda: "BRL" },
    });
  });

  it("dias do roteiro vêm antes dos itens que apontam para eles", () => {
    const { operacoes } = operacoesDoLegado(
      { ...vazio, roteiro: [{ id: "d", data: "", itens: [{ id: "i", horario: "9h", titulo: "Praia", nota: "" }] }] },
      ctx
    );
    expect(operacoes.map((o) => o.recurso)).toEqual(["roteiro_dias", "roteiro_itens"]);
    const [dia, item] = operacoes as Extract<(typeof operacoes)[number], { tipo: "criar" }>[];
    expect(item.registro).toMatchObject({ diaId: dia.registro.id, horario: "" });
    expect(dia.registro).toMatchObject({ data: null });
  });

  it("alerta ganha IATA das cidades conhecidas e hospedagem sem volta ganha 1 noite", () => {
    const { operacoes } = operacoesDoLegado(
      {
        ...vazio,
        alertas: [
          { id: "a", tipo: "voo", origem: "Belo Horizonte", destino: "Rio de Janeiro", ida: "2026-12-01", volta: "", precoAlvo: "800,00" },
          { id: "b", tipo: "hospedagem", origem: "", destino: "Búzios", ida: "2026-12-01", volta: "", precoAlvo: "" },
        ],
      },
      ctx
    );
    expect(operacoes[0]).toMatchObject({ registro: { origemIata: "CNF", destinoIata: "GIG", precoAlvo: 800 } });
    expect(operacoes[1]).toMatchObject({ registro: { volta: "2026-12-02", precoAlvo: null } });
  });

  it("o que o servidor recusaria é descartado e contado (não trava a fila)", () => {
    const { operacoes, descartados } = operacoesDoLegado(
      { ...vazio, despesas: [{ id: "x", data: "", estabelecimento: "Algo", valor: 2_000_000, categoriaDestino: "", escopo: "", origem: "" }] },
      ctx
    );
    expect(operacoes).toHaveLength(0);
    expect(descartados).toBe(1);
  });

  it("documentos nunca viram operação da fila (vão direto para a cifra no servidor)", () => {
    const { operacoes } = operacoesDoLegado({ ...vazio, documentos: [{ id: "d", tipo: "Passaporte", titular: "Ana", numero: "FX123", observacao: "" }] }, ctx);
    expect(operacoes).toHaveLength(0);
  });
});
