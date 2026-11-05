import { describe, expect, it } from "vitest";
import { ACORDO_PADRAO } from "@/lib/sync/contexto";
import type { Despesa } from "@/lib/sync/modelos";
import { montarResumoSemanal, resumoJaProcessado, segundaDaSemana, semanaAnterior, type EntradaResumo } from "./resumo-semanal";

const ANA = "ana";
const BRUNO = "bruno";
const WS = "ws-casal";

let seq = 0;
function gasto(c: Partial<Despesa> & Pick<Despesa, "valor">): Despesa {
  seq++;
  return {
    id: `d${seq}`,
    userId: ANA,
    workspaceId: WS,
    pagoPor: null,
    tipo: "gasto",
    descricao: `Gasto ${seq}`,
    moeda: "BRL",
    cotacaoBrl: null,
    data: "2026-10-28",
    categoria: "Hospedagem",
    escopo: "viagem_compartilhado",
    proporcaoDivisao: null,
    origem: "manual",
    criadoEm: "2026-10-28T12:00:00Z",
    atualizadoEm: "2026-10-28T12:00:00Z",
    atualizadoPor: null,
    ...c,
  };
}

const periodo = { inicio: "2026-10-26", fim: "2026-11-01" };
const membros = [
  { userId: ANA, nome: "Ana", papel: "dono" as const },
  { userId: BRUNO, nome: "Bruno", papel: "parceiro" as const },
];
const base = (despesas: Despesa[], userId = BRUNO): EntradaResumo => ({
  userId,
  workspaceId: WS,
  membros,
  acordo: ACORDO_PADRAO,
  despesas,
  periodo,
});

describe("semana do resumo", () => {
  it("acha a segunda-feira e a semana anterior completa", () => {
    expect(segundaDaSemana("2026-11-02")).toBe("2026-11-02"); // segunda
    expect(segundaDaSemana("2026-11-08")).toBe("2026-11-02"); // domingo
    expect(segundaDaSemana("2026-11-04")).toBe("2026-11-02"); // quarta
    expect(semanaAnterior("2026-11-02")).toEqual({ inicio: "2026-10-26", fim: "2026-11-01" });
  });

  it("sabe se o resumo desta semana já foi processado (fuso de São Paulo)", () => {
    expect(resumoJaProcessado(null, "2026-11-02")).toBe(false);
    expect(resumoJaProcessado("2026-11-02T11:05:00Z", "2026-11-02")).toBe(true);
    // 02:00 UTC de segunda ainda é domingo em Brasília: semana anterior.
    expect(resumoJaProcessado("2026-11-02T02:00:00Z", "2026-11-02")).toBe(false);
    expect(resumoJaProcessado("2026-10-26T11:00:00Z", "2026-11-04")).toBe(false);
  });
});

describe("montarResumoSemanal", () => {
  it("nunca soma o gasto privado do par nem gastos de outro espaço", () => {
    const r = montarResumoSemanal(
      base([
        gasto({ valor: 500 }),
        gasto({ valor: 70, escopo: "pessoal_privado", userId: ANA, workspaceId: WS }),
        gasto({ valor: 30, escopo: "pessoal_privado", userId: BRUNO, workspaceId: WS }),
        gasto({ valor: 999, workspaceId: "outro-casal" }),
      ])
    );
    expect(r.totalCompartilhado).toBe(500);
    expect(r.qtdCompartilhado).toBe(1);
    expect(r.totalPrivado).toBe(30);
    expect(r.qtdPrivado).toBe(1);
  });

  it("conta só os gastos da semana, com categorias e cotação", () => {
    const r = montarResumoSemanal(
      base([
        gasto({ valor: 300, data: "2026-10-26" }),
        gasto({ valor: 100, data: "2026-11-01", categoria: "Alimentação & Gastronomia" }),
        gasto({ valor: 50, data: "2026-11-01", categoria: "Gasto Pessoal (Fora da Viagem)" }),
        gasto({ valor: 20, moeda: "USD", cotacaoBrl: 5.5, data: "2026-10-30", categoria: "Alimentação & Gastronomia" }),
        gasto({ valor: 10, moeda: "EUR", cotacaoBrl: null, data: "2026-10-30" }),
        gasto({ valor: 800, data: "2026-10-25" }),
      ])
    );
    expect(r.totalCompartilhado).toBe(560);
    expect(r.qtdCompartilhado).toBe(4);
    expect(r.porCategoria).toEqual([
      { categoria: "Hospedagem", total: 300 },
      { categoria: "Alimentação & Gastronomia", total: 210 },
      { categoria: "Outros da viagem", total: 50 },
    ]);
    expect(r.semCotacao).toBe(1);
  });

  it("acerto da viagem inteira, com a regra do casal e o lado do destinatário", () => {
    // Ana pagou 1000 (inclusive fora da semana); 50/50 → Bruno deve 500.
    const despesas = [gasto({ valor: 600, data: "2026-10-01", pagoPor: ANA }), gasto({ valor: 400, pagoPor: ANA })];
    const paraBruno = montarResumoSemanal(base(despesas, BRUNO));
    expect(paraBruno.acerto).toEqual({ situacao: "pagar", valor: 500, nomePar: "Ana", regra: "Divisão igual (50/50)" });
    const paraAna = montarResumoSemanal(base(despesas, ANA));
    expect(paraAna.acerto).toMatchObject({ situacao: "receber", valor: 500, nomePar: "Bruno" });

    const proporcional = montarResumoSemanal({
      ...base(despesas, BRUNO),
      acordo: { ...ACORDO_PADRAO, regra: "proporcional", percentualDono: 60 },
    });
    expect(proporcional.acerto).toMatchObject({ situacao: "pagar", valor: 400, regra: "Ana 60% · Bruno 40%" });

    const comPix = montarResumoSemanal(
      base([...despesas, gasto({ valor: 500, tipo: "acerto", pagoPor: BRUNO, userId: BRUNO, proporcaoDivisao: 0 })], BRUNO)
    );
    expect(comPix.acerto).toMatchObject({ situacao: "quites", valor: 0 });
  });

  it("sem par no espaço não há acerto; sem gastos e quites, nada a contar", () => {
    const sozinha = montarResumoSemanal({ ...base([gasto({ valor: 10 })], ANA), membros: [membros[0]] });
    expect(sozinha.acerto).toBeNull();
    expect(sozinha.vazio).toBe(false);

    const vazio = montarResumoSemanal(base([gasto({ valor: 100, data: "2026-09-01", pagoPor: ANA }), gasto({ valor: 100, data: "2026-09-02", pagoPor: BRUNO, userId: BRUNO })]));
    expect(vazio.acerto?.situacao).toBe("quites");
    expect(vazio.vazio).toBe(true);
  });
});
