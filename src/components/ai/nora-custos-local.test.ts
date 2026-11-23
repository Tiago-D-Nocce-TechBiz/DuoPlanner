import { beforeEach, describe, expect, it, vi } from "vitest";
import { DADOS_VAZIOS, resumirContexto, type DadosBrutos } from "@/lib/ai/nora-contexto";
import { idDoLancamento } from "@/lib/roteiro/lancamento";
import type { Despesa, RoteiroItem } from "@/lib/sync/modelos";
import { consultarComFallback } from "./nora-consulta";
import { custosDeRegistros } from "./nora-custos-local";

vi.mock("server-only", () => ({}));

const registros = vi.hoisted(() => ({ despesas: [] as unknown[], roteiro_itens: [] as unknown[] }));
vi.mock("@/lib/sync/motor", () => ({ getRegistros: (recurso: "despesas" | "roteiro_itens") => registros[recurso] }));

const HOJE = "2026-10-20";
const ITEM_LANCADO = "30000000-0000-4000-8000-000000000001";
const ITEM_A_LANCAR = "30000000-0000-4000-8000-000000000002";

const gasto = (id: string, valor: number, categoria: Despesa["categoria"], data: string, extra: Partial<Despesa> = {}): Despesa => ({
  id,
  userId: "u1",
  workspaceId: "w1",
  pagoPor: null,
  tipo: "gasto",
  descricao: `Compra ${id}`,
  valor,
  moeda: "BRL",
  cotacaoBrl: null,
  data,
  categoria,
  escopo: "viagem_compartilhado",
  proporcaoDivisao: null,
  origem: "manual",
  criadoEm: "",
  atualizadoEm: "",
  atualizadoPor: null,
  ...extra,
});

const item = (id: string, custoEstimado: number | null): RoteiroItem => ({
  id,
  workspaceId: "w1",
  diaId: "d",
  horario: "",
  titulo: "Atividade",
  nota: "",
  custoEstimado,
  ordem: 0,
  atualizadoEm: "",
  atualizadoPor: null,
});

const DESPESAS: Despesa[] = [
  gasto("d1", 1200, "Hospedagem", "2026-10-01"),
  gasto("d2", 300, "Alimentação & Gastronomia", "2026-10-02"),
  gasto("d3", 100, "Passeios & Lazer", "2026-10-05", { descricao: "Loja XYZ PARC 03/10", parcelaAtual: 3, totalParcelas: 10 }),
  gasto("d4", 100, "Passeios & Lazer", "2026-10-06", { descricao: "Loja XYZ PARC 04/10", parcelaAtual: 4, totalParcelas: 10 }),
  gasto(idDoLancamento(ITEM_LANCADO, "compartilhado", ""), 200, "Passeios & Lazer", "2026-10-07"),
  gasto("d6", 50, "Passeios & Lazer", "2026-10-08", { moeda: "USD" }),
];
const ITENS = [item(ITEM_LANCADO, 200), item(ITEM_A_LANCAR, 300), item("x", null)];

describe("custos com os dados do aparelho", () => {
  it("mesmos números do servidor para os mesmos dados (paridade)", () => {
    const noServidor: DadosBrutos = {
      ...DADOS_VAZIOS,
      despesas: DESPESAS.map((d) => ({
        id: d.id,
        valor: d.valor,
        moeda: d.moeda,
        cotacao_brl: d.cotacaoBrl,
        categoria: d.categoria,
        escopo: d.escopo,
        tipo: d.tipo,
        data: d.data,
        descricao: d.descricao,
        parcela_atual: d.parcelaAtual ?? null,
        total_parcelas: d.totalParcelas ?? null,
      })),
      itens: ITENS.map((i) => ({ id: i.id, dia_id: "d", horario: "", titulo: "Atividade", ordem: 0, custo_estimado: i.custoEstimado })),
    };
    const doServidor = resumirContexto(noServidor, [], HOJE).custos;
    expect(custosDeRegistros(DESPESAS, ITENS, HOJE)).toEqual(doServidor);
    expect(doServidor.totalCentavos).toBe(190_000);
  });

  it("gasto privado e acerto nunca entram, mesmo estando no aparelho", () => {
    const comPrivados = [
      ...DESPESAS,
      gasto("p1", 9_999, "Gasto Pessoal (Fora da Viagem)", "2026-10-09", { escopo: "pessoal_privado" }),
      gasto("a1", 8_888, "Hospedagem", "2026-10-09", { tipo: "acerto", proporcaoDivisao: 0 }),
    ];
    expect(custosDeRegistros(comPrivados, ITENS, HOJE)).toEqual(custosDeRegistros(DESPESAS, ITENS, HOJE));
  });

  it("moeda estrangeira sem cotação fica de fora e é contada; com cotação converte", () => {
    const r = custosDeRegistros([gasto("e1", 10, "Hospedagem", "2026-10-01", { moeda: "EUR", cotacaoBrl: 6 }), gasto("e2", 10, "Hospedagem", "2026-10-01", { moeda: "EUR" })], [], HOJE);
    expect(r.totalCentavos).toBe(6_000);
    expect(r.semCotacao).toBe(1);
  });
});

describe("fallback offline da gestão de custos", () => {
  beforeEach(() => {
    registros.despesas = DESPESAS;
    registros.roteiro_itens = ITENS;
  });

  it("sem conexão (a chamada lança), mostra os números do aparelho, sem IA e sem cota", async () => {
    const r = await consultarComFallback("gestao_custos", "", async () => {
      throw new TypeError("Failed to fetch");
    });
    if (r.tipo !== "analise") throw new Error("esperava análise");
    expect(r.origem).toBe("local");
    expect(r.custos?.totalCentavos).toBe(190_000);
    expect(r.custos?.parcelas.restantesCentavos).toBe(60_000);
    expect(r.aviso).toContain("Sem conexão");
    expect(r.aviso).toContain("neste aparelho");
    expect(r.analise.resumo).toContain("R$ 1.900,00 em 5 gastos compartilhados");
    expect(r.analise.pontosDeAtencao.length).toBeGreaterThan(0);
  });

  it("falha prevista da ação (ex.: erro interno) também cai nos números do aparelho", async () => {
    const r = await consultarComFallback("gestao_custos", "", async () => ({ success: false, code: "ERRO_INTERNO", error: "Algo deu errado." }));
    expect(r).toMatchObject({ tipo: "analise", origem: "local", custos: { totalCentavos: 190_000 } });
  });

  it("aparelho sem nada lançado: o estado vazio ensina a começar", async () => {
    registros.despesas = [];
    registros.roteiro_itens = [];
    const r = await consultarComFallback("gestao_custos", "", async () => {
      throw new Error("offline");
    });
    if (r.tipo !== "analise") throw new Error("esperava análise");
    expect(r.analise.resumo).toContain("Ainda não há gastos");
    expect(r.custos?.quantidade).toBe(0);
  });

  it("as outras ferramentas não carregam nem mostram custos", async () => {
    const r = await consultarComFallback("auditoria_voo", "", async () => {
      throw new Error("offline");
    });
    expect(r).toMatchObject({ tipo: "analise", custos: null });
    expect(r.tipo === "analise" && r.aviso).not.toContain("neste aparelho");
  });
});
