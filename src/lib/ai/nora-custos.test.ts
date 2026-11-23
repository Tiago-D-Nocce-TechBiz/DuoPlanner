import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sessao } from "@/lib/auth/sessao";
import { idDoLancamento } from "@/lib/roteiro/lancamento";
import { aplicarRegrasDeCustos, consultarAdvisor, type DependenciasAdvisor } from "./nora-advisor";
import { blocoDeCustos, carregarDadosBrutos, DADOS_VAZIOS, mensagemParaOModelo, perguntaDeLacuna, resumirContexto, type DadosBrutos } from "./nora-contexto";
import { analiseLocal } from "./nora-strategies-local";
import type { AnaliseNora } from "./nora-strategies";

vi.mock("server-only", () => ({}));

const sessao = { supabase: {}, userId: "u-1", email: null } as unknown as Sessao;
const HOJE = "2026-10-20";

/* ---------------------------------- dados ---------------------------------- */

const ITEM_LANCADO = "30000000-0000-4000-8000-000000000001";
const ITEM_A_LANCAR = "30000000-0000-4000-8000-000000000002";

type Despesa = DadosBrutos["despesas"][number];
const despesa = (id: string, valor: number, categoria: string, data: string, extra: Partial<Despesa> = {}): Despesa => ({
  id,
  valor,
  moeda: "BRL",
  cotacao_brl: null,
  categoria,
  escopo: "viagem_compartilhado",
  tipo: "gasto",
  data,
  descricao: `Descrição secreta ${id}`,
  parcela_atual: null,
  total_parcelas: null,
  ...extra,
});

/** R$ 1.900,00 compartilhados; R$ 600,00 em parcelas a pagar; Roteiro com R$ 300,00 a lançar. */
const DESPESAS: Despesa[] = [
  despesa("d1", 1200, "Hospedagem", "2026-10-01"),
  despesa("d2", 300, "Alimentação & Gastronomia", "2026-10-02"),
  despesa("d3", 100, "Passeios & Lazer", "2026-10-05", { descricao: "Loja XYZ PARC 03/10", parcela_atual: 3, total_parcelas: 10 }),
  despesa("d4", 100, "Passeios & Lazer", "2026-10-06", { descricao: "Loja XYZ PARC 04/10", parcela_atual: 4, total_parcelas: 10 }),
  despesa(idDoLancamento(ITEM_LANCADO, "compartilhado", ""), 200, "Passeios & Lazer", "2026-10-07"),
  despesa("d6", 50, "Transporte", "2026-10-08", { moeda: "USD" }), // sem cotação
];

const DADOS: DadosBrutos = {
  ...DADOS_VAZIOS,
  despesas: DESPESAS,
  itens: [
    { id: ITEM_LANCADO, dia_id: "dia", horario: "", titulo: "Jantar", ordem: 0, custo_estimado: "200.00" },
    { id: ITEM_A_LANCAR, dia_id: "dia", horario: "", titulo: "Passeio de barco", ordem: 1, custo_estimado: 300 },
    { id: "30000000-0000-4000-8000-000000000003", dia_id: "dia", horario: "", titulo: "Sem custo", ordem: 2, custo_estimado: null },
  ],
};

describe("custos no contexto da Nora", () => {
  const custos = resumirContexto(DADOS, [], HOJE).custos;

  it("calcula os números em centavos, sem contar a mesma parcela duas vezes", () => {
    expect(custos).toMatchObject({
      quantidade: 5,
      totalCentavos: 190_000,
      semCotacao: 1,
      truncado: false,
      parcelas: { compras: 1, abertas: 6, restantesCentavos: 60_000 },
      roteiro: { itensComCusto: 2, estimadoCentavos: 50_000, lancadoCentavos: 20_000, aLancarCentavos: 30_000 },
      previsaoCentavos: 190_000 + 60_000 + 30_000,
    });
    expect(custos.porCategoria[0]).toMatchObject({ categoria: "Hospedagem", centavos: 120_000, permil: 632 });
  });

  it("sinais: concentração, moeda sem cotação e Roteiro a lançar", () => {
    expect(custos.sinais.map((s) => [s.id, s.gravidade])).toEqual([
      ["concentracao_categoria", "atencao"],
      ["sem_cotacao", "atencao"],
      ["roteiro_a_lancar", "info"],
    ]);
  });

  it("gasto privado, acerto e qualquer coisa que não seja compartilhado nunca entram na conta", () => {
    const comIntrusos = resumirContexto(
      {
        ...DADOS,
        despesas: [
          ...DESPESAS,
          despesa("p1", 9_999, "Gasto Pessoal (Fora da Viagem)", "2026-10-09", { escopo: "pessoal_privado" }),
          despesa("a1", 8_888, "Hospedagem", "2026-10-09", { tipo: "acerto" }),
        ],
      },
      [],
      HOJE
    );
    expect(comIntrusos.custos).toEqual(custos);
    expect(comIntrusos.gastos.totalBrl).toBe(resumirContexto(DADOS, [], HOJE).gastos.totalBrl);
  });

  it("o prompt leva os números e os sinais, e nenhuma descrição, id ou nome de atividade", () => {
    const mensagem = mensagemParaOModelo(resumirContexto(DADOS, [], HOJE), HOJE, "");
    expect(mensagem).toContain("<custos_calculados>");
    expect(mensagem).toContain("Gastos compartilhados: R$ 1.900,00 em 5 lançamentos");
    expect(mensagem).toContain("Hospedagem R$ 1.200,00 (63,2%)");
    expect(mensagem).toContain("Parcelas de cartão ainda a pagar: R$ 600,00 em 6 parcelas de 1 compras");
    expect(mensagem).toContain("(R$ 200,00 já lançados; R$ 300,00 a lançar)");
    expect(mensagem).toContain("Previsão comprometida (gasto + parcelas + Roteiro a lançar): R$ 2.800,00");
    expect(mensagem).toContain("- [atencao] Gastos concentrados em Hospedagem");
    for (const proibido of ["Descrição secreta", "Loja XYZ", "d1", "Passeio de barco", ITEM_LANCADO]) expect(mensagem).not.toContain(proibido);
  });

  it("sem gastos nem custos, o bloco nem aparece", () => {
    const vazio = resumirContexto(DADOS_VAZIOS, [], HOJE);
    expect(mensagemParaOModelo(vazio, HOJE, "")).not.toContain("<custos_calculados>");
    expect(blocoDeCustos(vazio.custos)).toContain("Gastos compartilhados: nenhum lançado");
  });

  it("a gestão de custos só pede mais informação quando não há nenhum dado de custo", () => {
    const vazio = resumirContexto(DADOS_VAZIOS, [], HOJE);
    expect(perguntaDeLacuna("gestao_custos", vazio, "um texto bem comprido sobre tudo")).toContain("Ainda não há gastos compartilhados");
    expect(perguntaDeLacuna("gestao_custos", resumirContexto(DADOS, [], HOJE), "")).toBeNull();
    const soRoteiro = resumirContexto({ ...DADOS_VAZIOS, itens: [DADOS.itens[1]] }, [], HOJE);
    expect(perguntaDeLacuna("gestao_custos", soRoteiro, "")).toBeNull();
  });

  it("lançamentos demais: avisa que a leitura foi cortada", () => {
    const muitas = Array.from({ length: 500 }, (_, i) => despesa(`m${i}`, 10, "Hospedagem", "2026-10-01"));
    expect(resumirContexto({ ...DADOS_VAZIOS, despesas: muitas }, [], HOJE).custos.truncado).toBe(true);
  });
});

/* ------------------------------- carregamento ------------------------------- */

type Chamada = { tabela: string; colunas: string; filtros: [string, unknown][] };

function bancoFalso(respostas: (c: Chamada, n: number) => { data: unknown; error: { code?: string; message?: string } | null }) {
  const chamadas: Chamada[] = [];
  const porTabela = new Map<string, number>();
  const from = (tabela: string) => {
    const c: Chamada = { tabela, colunas: "", filtros: [] };
    const q: Record<string, unknown> = {};
    q.select = (cols: string) => ((c.colunas = cols), q);
    q.eq = (k: string, v: unknown) => (c.filtros.push([k, v]), q);
    q.order = () => q;
    q.limit = () => q;
    q.then = (ok: (v: unknown) => unknown) => {
      chamadas.push(c);
      const n = (porTabela.get(tabela) ?? 0) + 1;
      porTabela.set(tabela, n);
      return ok(respostas(c, n));
    };
    return q;
  };
  return { supabase: { from } as unknown as SupabaseClient, chamadas };
}

describe("leitura dos dados de custo", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

  it("gastos: só compartilhados, tipo gasto, com colunas nomeadas (sem SELECT *)", async () => {
    const { supabase, chamadas } = bancoFalso(() => ({ data: [], error: null }));
    await carregarDadosBrutos(supabase, "ws-1");
    const d = chamadas.find((c) => c.tabela === "despesas_viagem")!;
    expect(d.filtros).toEqual(expect.arrayContaining([["workspace_id", "ws-1"], ["escopo", "viagem_compartilhado"], ["tipo", "gasto"]]));
    expect(d.colunas).toContain("parcela_atual");
    expect(d.colunas).not.toContain("*");
    const r = chamadas.find((c) => c.tabela === "roteiro_itens")!;
    expect(r.colunas).toContain("custo_estimado");
    expect(r.colunas).not.toContain("*");
  });

  it("banco sem a coluna custo_estimado (migration do Roteiro pendente): lê o roteiro sem ela, sem perdê-lo", async () => {
    const { supabase, chamadas } = bancoFalso((c) => {
      if (c.tabela === "roteiro_itens" && c.colunas.includes("custo_estimado")) return { data: null, error: { code: "42703", message: "column roteiro_itens.custo_estimado does not exist" } };
      if (c.tabela === "roteiro_itens") return { data: [{ id: "i1", dia_id: "d1", horario: "", titulo: "Passeio", ordem: 0 }], error: null };
      return { data: [], error: null };
    });
    const dados = await carregarDadosBrutos(supabase, "ws-1");
    expect(dados.itens).toHaveLength(1);
    const lidas = chamadas.filter((c) => c.tabela === "roteiro_itens").map((c) => c.colunas);
    expect(lidas).toHaveLength(2);
    expect(lidas[1]).not.toContain("custo_estimado");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("outro erro no roteiro não dispara nova consulta: parte vazia e registrada", async () => {
    const { supabase, chamadas } = bancoFalso((c) => (c.tabela === "roteiro_itens" ? { data: null, error: { code: "57014", message: "timeout" } } : { data: [], error: null }));
    expect((await carregarDadosBrutos(supabase, "ws-1")).itens).toEqual([]);
    expect(chamadas.filter((c) => c.tabela === "roteiro_itens")).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });
});

/* --------------------------------- advisor --------------------------------- */

const analiseDaIa = (extra: Partial<AnaliseNora> = {}): AnaliseNora => ({
  resumo: "Vocês gastaram R$ 1.900,00 e a hospedagem pesa mais.",
  vereditoBadge: "ESPERE",
  notaCustoBeneficio: 9,
  economiaEstimada: { valorBrl: 999, descricao: "Cortando tudo." },
  opcoes: [{ titulo: "Opção da IA", destaque: null, detalhe: "x", custoEstimadoBrl: 1 }],
  pontosDeAtencao: [{ gravidade: "info", titulo: "Reserva antecipada", detalhe: "Fechem o hotel das próximas viagens com antecedência." }],
  recomendacaoPratica: "Combinem um limite por dia nos próximos dias.",
  acaoSugerida: "criar_alerta_preco",
  precoAlvoSugeridoBrl: 123,
  ...extra,
});

function deps(extra: Partial<DependenciasAdvisor> = {}, dados: DadosBrutos = DADOS) {
  const invoke = vi.fn(async () => analiseDaIa() as unknown);
  const cota = vi.fn(async () => ({ permitido: true as const, restante: 5 }));
  const base: DependenciasAdvisor = {
    hojeIso: HOJE,
    iaAtiva: () => true,
    cota: cota as never,
    carregar: async () => ({ dados, preferencias: [] }),
    modelo: { invoke },
    ...extra,
  };
  return { base, invoke, cota };
}

describe("gestão de custos no advisor", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

  it("sem nenhum dado de custo: pergunta, sem gastar cota nem chamar o modelo", async () => {
    const { base, invoke, cota } = deps({}, DADOS_VAZIOS);
    const r = await consultarAdvisor({ estrategia: "gestao_custos", texto: "" }, sessao, base);
    expect(r.tipo).toBe("pergunta");
    expect(cota).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("SEM chave: análise local completa, com os números do app, sem cota nem modelo", async () => {
    const { base, invoke, cota } = deps({ iaAtiva: () => false });
    const r = await consultarAdvisor({ estrategia: "gestao_custos", texto: "" }, sessao, base);
    if (r.tipo !== "analise") throw new Error("esperava análise");
    expect(r.origem).toBe("local");
    expect(r.custos?.totalCentavos).toBe(190_000);
    expect(r.analise.resumo).toContain("R$ 1.900,00 em 5 gastos compartilhados");
    expect(r.analise.resumo).toContain("Ainda há R$ 600,00 em parcelas a pagar");
    expect(r.analise.pontosDeAtencao.map((p) => p.titulo)).toEqual(r.custos!.sinais.map((s) => s.titulo));
    expect(r.analise.opcoes).toEqual([]);
    expect(r.analise.recomendacaoPratica).toContain("categoria que mais pesa");
    expect(cota).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("SEM cota: o mesmo resultado local, e o modelo nunca é chamado", async () => {
    const { base, invoke } = deps({ cota: async () => ({ permitido: false, motivo: "limite", mensagem: "Limite de uso da IA atingido.", reiniciaEm: null }) as never });
    const r = await consultarAdvisor({ estrategia: "gestao_custos", texto: "" }, sessao, base);
    if (r.tipo !== "analise") throw new Error("esperava análise");
    expect(r).toMatchObject({ origem: "local" });
    expect(r.aviso).toContain("Limite de uso da IA atingido.");
    expect(r.custos?.previsaoCentavos).toBe(280_000);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("prazo de 12 s estourado ou IA fora do ar: análise local com os mesmos números", async () => {
    const prazo = deps({ modelo: { invoke: async () => Promise.reject(new DOMException("timeout", "TimeoutError")) } });
    const r1 = await consultarAdvisor({ estrategia: "gestao_custos", texto: "" }, sessao, prazo.base);
    expect(r1).toMatchObject({ tipo: "analise", origem: "local" });
    expect(r1.tipo === "analise" && r1.aviso).toContain("12 segundos");
    expect(r1.tipo === "analise" && r1.custos?.totalCentavos).toBe(190_000);
    const fora = deps({ modelo: { invoke: async () => Promise.reject(new Error("503")) } });
    expect(await consultarAdvisor({ estrategia: "gestao_custos", texto: "" }, sessao, fora.base)).toMatchObject({ origem: "local" });
  });

  it("com IA: gasta uma cota, manda o bloco de custos, e os sinais do app vêm antes das leituras da IA", async () => {
    const { base, invoke, cota } = deps();
    const r = await consultarAdvisor({ estrategia: "gestao_custos", texto: "" }, sessao, base);
    if (r.tipo !== "analise") throw new Error("esperava análise");
    expect(cota).toHaveBeenCalledTimes(1);
    const [mensagens, opcoes] = invoke.mock.calls[0] as unknown as [{ content: string }[], { signal: AbortSignal }];
    expect(mensagens[0].content).toContain("GESTÃO DE CUSTOS");
    expect(mensagens[0].content).toContain("<custos_calculados>");
    expect(mensagens[1].content).toContain("<custos_calculados>");
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
    expect(r.origem).toBe("ia");
    expect(r.aviso).toBeNull();
    expect(r.analise.resumo).toBe("Vocês gastaram R$ 1.900,00 e a hospedagem pesa mais.");
    const titulos = r.analise.pontosDeAtencao.map((p) => p.titulo);
    expect(titulos).toEqual([...r.custos!.sinais.map((s) => s.titulo), "Reserva antecipada"]);
    // Nada de número vindo do modelo: nota, veredito, economia, opções e alerta são zerados.
    expect(r.analise).toMatchObject({ vereditoBadge: null, notaCustoBeneficio: null, economiaEstimada: null, precoAlvoSugeridoBrl: null, acaoSugerida: "nenhuma", opcoes: [] });
  });

  it("valor em reais que o app não calculou: o texto da IA é trocado pelo determinístico, e o card avisa", async () => {
    const inventado = analiseDaIa({
      resumo: "Vocês gastaram R$ 2.350,00 até aqui.",
      recomendacaoPratica: "Cortem R$ 480,00 por semana.",
      pontosDeAtencao: [
        { gravidade: "atencao", titulo: "Sobra pouco", detalhe: "Restam R$ 77,00 de folga." },
        { gravidade: "info", titulo: "Ritmo", detalhe: "Mantenham a média de R$ 1.900,00 como teto." },
      ],
    });
    const { base } = deps({ modelo: { invoke: async () => inventado } });
    const r = await consultarAdvisor({ estrategia: "gestao_custos", texto: "" }, sessao, base);
    if (r.tipo !== "analise") throw new Error("esperava análise");
    expect(r.analise.resumo).toContain("R$ 1.900,00 em 5 gastos compartilhados");
    expect(r.analise.resumo).not.toContain("2.350");
    expect(r.analise.recomendacaoPratica).not.toContain("480");
    const titulos = r.analise.pontosDeAtencao.map((p) => p.titulo);
    expect(titulos).not.toContain("Sobra pouco");
    expect(titulos).toContain("Ritmo"); // R$ 1.900,00 é um valor do app
    expect(r.aviso).toContain("trocados pelos números do app");
  });

  it("aplicarRegrasDeCustos: máximo de 8 pontos, sinais primeiro", () => {
    const custos = resumirContexto(DADOS, [], HOJE).custos;
    const muitos = analiseDaIa({ pontosDeAtencao: Array.from({ length: 8 }, (_, i) => ({ gravidade: "info" as const, titulo: `P${i}`, detalhe: "sem valores" })) });
    const { analise, aviso } = aplicarRegrasDeCustos(muitos, custos);
    expect(analise.pontosDeAtencao).toHaveLength(8);
    expect(analise.pontosDeAtencao[0].titulo).toBe(custos.sinais[0].titulo);
    expect(aviso).toBeNull();
  });

  it("as outras ferramentas recebem o bloco de custos no prompt, mas não o painel", async () => {
    const { base, invoke } = deps({ modelo: { invoke: vi.fn(async () => ({ ...analiseDaIa(), economiaEstimada: { valorBrl: 500, descricao: "20%" } }) as unknown) } });
    const r = await consultarAdvisor({ estrategia: "otimizacao_orcamento", texto: "" }, sessao, base);
    if (r.tipo !== "analise") throw new Error("esperava análise");
    const modelo = base.modelo as { invoke: ReturnType<typeof vi.fn> };
    expect((modelo.invoke.mock.calls[0] as unknown as [{ content: string }[]])[0][1].content).toContain("<custos_calculados>");
    expect(r.custos).toBeNull();
    expect(r.analise.economiaEstimada).not.toBeNull(); // esta ferramenta continua com a sua análise
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("análise local de custos", () => {
  it("estado vazio: ensina como começar, sem número nenhum", () => {
    const a = analiseLocal("gestao_custos", { destino: null, origem: null, ida: null, volta: null, adultos: null, diasNoRoteiro: 0, atividadesNoRoteiro: 0, gastoCompartilhadoBrl: 0, quantidadeDePreferencias: 0 });
    expect(a.resumo).toContain("Ainda não há gastos");
    expect(a.opcoes.length).toBeGreaterThan(0);
    expect(a.pontosDeAtencao[0].titulo).toBe("Gastos privados ficam de fora");
  });

  it("sem sinais: diz que não há alertas, em vez de listar vazio", () => {
    const calmo = resumirContexto({ ...DADOS_VAZIOS, despesas: [despesa("a", 200, "A", "2026-10-01"), despesa("b", 200, "B", "2026-10-02"), despesa("c", 200, "C", "2026-10-03")] }, [], HOJE).custos;
    const a = analiseLocal("gestao_custos", { destino: null, origem: null, ida: null, volta: null, adultos: null, diasNoRoteiro: 0, atividadesNoRoteiro: 0, gastoCompartilhadoBrl: 0, quantidadeDePreferencias: 0 }, calmo);
    expect(a.pontosDeAtencao).toHaveLength(1);
    expect(a.pontosDeAtencao[0].titulo).toBe("Sem alertas de custo agora");
    expect(a.recomendacaoPratica).toContain("Sem alertas agora");
  });
});
