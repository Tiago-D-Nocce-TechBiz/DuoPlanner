import { describe, expect, it } from "vitest";
import {
  CUSTOS_VAZIOS,
  LIMIARES_DE_CUSTO as L,
  calcularCustos,
  chaveDaCompraParcelada,
  percentualTexto,
  reais,
  soCitaValoresConhecidos,
  temDadosDeCusto,
  valoresEmReaisDoTexto,
  type EntradaDeCustos,
  type GastoParaCusto,
  type ItemDeRoteiroParaCusto,
} from "./cost-agent-metrics";

const HOJE = "2026-10-20";

const g = (centavos: number, categoria = "Hospedagem", dia: string | null = "2026-10-05", extra: Partial<GastoParaCusto> = {}): GastoParaCusto => ({
  centavos,
  categoria,
  dia,
  parcelaAtual: null,
  totalParcelas: null,
  compra: null,
  ...extra,
});

const calcular = (gastos: GastoParaCusto[], extra: Partial<EntradaDeCustos> = {}) =>
  calcularCustos({ gastos, roteiro: [], semCotacao: 0, truncado: false, hojeIso: HOJE, ...extra });

const sinal = (r: ReturnType<typeof calcular>, id: string) => r.sinais.find((s) => s.id === id);

describe("total, período e média diária (centavos exatos)", () => {
  it("sem nada, tudo zerado e sem sinais", () => {
    expect(calcular([])).toEqual(CUSTOS_VAZIOS);
    expect(temDadosDeCusto(calcular([]))).toBe(false);
  });

  it("soma em centavos, período do primeiro ao último lançamento (inclusive) e média ao centavo", () => {
    const r = calcular([g(10_000, "Hospedagem", "2026-10-01"), g(20_000, "Comida", "2026-10-03"), g(5_001, "Comida", "2026-10-05")]);
    expect(r.quantidade).toBe(3);
    expect(r.totalCentavos).toBe(35_001);
    expect(r.periodo).toEqual({ inicio: "2026-10-01", fim: "2026-10-05", dias: 5 });
    expect(r.diasComGasto).toBe(3);
    expect(r.mediaDiariaCentavos).toBe(7_000); // 35001 ÷ 5 = 7000,2
  });

  it("meio centavo arredonda para cima; um lançamento é um dia", () => {
    expect(calcular([g(500, "A", "2026-10-01"), g(501, "A", "2026-10-02")]).mediaDiariaCentavos).toBe(501); // 1001 ÷ 2 = 500,5
    const um = calcular([g(12_345, "A", "2026-10-09")]);
    expect(um.periodo?.dias).toBe(1);
    expect(um.mediaDiariaCentavos).toBe(12_345);
  });

  it("somar mil lançamentos de 1 centavo dá 1000 (sem erro de ponto flutuante)", () => {
    expect(calcular(Array.from({ length: 1000 }, () => g(1))).totalCentavos).toBe(1000);
  });

  it("ignora o que não é valor válido: zero, negativo, fracionário, NaN e inteiro inseguro", () => {
    const r = calcular([g(0), g(-5), g(1.5), g(Number.NaN), g(Number.MAX_SAFE_INTEGER + 2), g(100)]);
    expect(r.quantidade).toBe(1);
    expect(r.totalCentavos).toBe(100);
  });

  it("lançamento sem data entra no total, mas não no período", () => {
    const r = calcular([g(1000, "A", null), g(1000, "A", "2026-10-01")]);
    expect(r.totalCentavos).toBe(2000);
    expect(r.periodo?.dias).toBe(1);
    expect(r.diasComGasto).toBe(1);
  });
});

describe("concentração por categoria", () => {
  it("ordena por valor e desempata pelo nome; percentual em décimos de ponto", () => {
    const r = calcular([g(6_000, "Comida"), g(3_000, "Hospedagem"), g(1_000, "Passeios"), g(3_000, "Aéreo")]);
    expect(r.porCategoria.map((c) => [c.categoria, c.centavos, c.permil, c.quantidade])).toEqual([
      ["Comida", 6_000, 462, 1],
      ["Aéreo", 3_000, 231, 1],
      ["Hospedagem", 3_000, 231, 1],
      ["Passeios", 1_000, 77, 1],
    ]);
  });

  it("a soma dos centavos das categorias é sempre o total", () => {
    const gastos = Array.from({ length: 97 }, (_, i) => g(137 * (i + 1) + (i % 7), ["A", "B", "C", "D"][i % 4]));
    const r = calcular(gastos);
    expect(r.porCategoria.reduce((s, c) => s + c.centavos, 0)).toBe(r.totalCentavos);
    expect(r.porCategoria.reduce((s, c) => s + c.quantidade, 0)).toBe(r.quantidade);
  });
});

describe("últimos 7 dias", () => {
  it("a janela é de hoje −6 a hoje, inclusive; datas futuras não contam", () => {
    const r = calcular([g(1_000, "A", "2026-10-13"), g(2_000, "A", "2026-10-14"), g(3_000, "A", "2026-10-20"), g(9_000, "A", "2026-10-25")]);
    expect(r.ultimos7Dias.totalCentavos).toBe(5_000);
    expect(r.ultimos7Dias.mediaDiariaCentavos).toBe(714); // 5000 ÷ 7 = 714,28
    expect(r.totalCentavos).toBe(15_000); // o futuro entra no total geral
  });
});

describe("parcelas restantes (uma vez por compra)", () => {
  const parcela = (centavos: number, atual: number, total: number, compra: string | null = "loja|1") =>
    g(centavos, "Compras", "2026-10-05", { parcelaAtual: atual, totalParcelas: total, compra });

  it("a mesma compra em várias faturas conta pela parcela mais recente, sem dobrar", () => {
    const r = calcular([parcela(10_000, 3, 10), parcela(10_000, 4, 10), parcela(10_000, 2, 10)]);
    expect(r.parcelas).toEqual({ compras: 1, abertas: 6, restantesCentavos: 60_000 });
  });

  it("compras diferentes somam; última parcela e dados inválidos não contam", () => {
    const r = calcular([
      parcela(10_000, 4, 10, "a|1"),
      parcela(5_000, 1, 3, "b|1"),
      parcela(7_000, 10, 10, "c|1"), // quitada
      parcela(7_000, 5, 4, "d|1"), // atual > total
      parcela(7_000, 1, 1, "e|1"), // não é parcelado
      g(7_000), // à vista
    ]);
    expect(r.parcelas).toEqual({ compras: 2, abertas: 8, restantesCentavos: 60_000 + 10_000 });
  });

  it("sem chave de compra, cada linha é uma compra", () => {
    const r = calcular([parcela(1_000, 1, 3, null), parcela(1_000, 1, 3, null)]);
    expect(r.parcelas).toEqual({ compras: 2, abertas: 4, restantesCentavos: 4_000 });
  });

  it("a chave ignora o 'n/m' da descrição, acentos e maiúsculas", () => {
    const a = chaveDaCompraParcelada("LOJA XYZ PARC 03/12", 10_000, 12);
    expect(chaveDaCompraParcelada("Loja XYZ 04/12", 10_000, 12)).toBe(a);
    expect(chaveDaCompraParcelada("Lója   xyz", 10_000, 12)).toBe(a);
    expect(chaveDaCompraParcelada("Loja XYZ", 10_001, 12)).not.toBe(a);
    expect(chaveDaCompraParcelada("Loja XYZ", 10_000, 10)).not.toBe(a);
  });
});

describe("Roteiro e previsão", () => {
  const item = (custoCentavos: number, lancado = false): ItemDeRoteiroParaCusto => ({ custoCentavos, lancado });

  it("separa o estimado, o já lançado e o que falta lançar; ignora custo zero ou inválido", () => {
    const r = calcular([g(10_000)], { roteiro: [item(30_000), item(12_000, true), item(0), item(-5), item(Number.NaN)] });
    expect(r.roteiro).toEqual({ itensComCusto: 2, estimadoCentavos: 42_000, lancadoCentavos: 12_000, aLancarCentavos: 30_000 });
    expect(temDadosDeCusto(calcular([], { roteiro: [item(100)] }))).toBe(true);
  });

  it("previsão = gasto + parcelas restantes + Roteiro a lançar", () => {
    const r = calcular([g(10_000), g(20_000, "Compras", "2026-10-05", { parcelaAtual: 1, totalParcelas: 3, compra: "x" })], { roteiro: [item(5_000), item(7_000, true)] });
    expect(r.parcelas.restantesCentavos).toBe(40_000);
    expect(r.previsaoCentavos).toBe(30_000 + 40_000 + 5_000);
  });
});

describe("sinais objetivos (fronteiras dos limiares)", () => {
  describe("concentração em uma categoria", () => {
    // Dois grupos: o topo com `parte` de cada 1000 centavos de um total de 100_000.
    const com = (permilDoTopo: number) => calcular([g(permilDoTopo * 100, "Hospedagem"), g((1000 - permilDoTopo) * 100, "Comida", "2026-10-06"), g(1, "Comida", "2026-10-07")]);

    it("60,0% é atenção; 59,9% não é nada", () => {
      const limite = com(L.concentracaoAtencaoPermil);
      expect(sinal(limite, "concentracao_categoria")?.gravidade).toBe("atencao");
      expect(sinal(com(L.concentracaoAtencaoPermil - 1), "concentracao_categoria")).toBeUndefined();
    });

    it("80,0% é crítico; 79,9% ainda é atenção", () => {
      expect(sinal(com(L.concentracaoCriticoPermil), "concentracao_categoria")?.gravidade).toBe("critico");
      expect(sinal(com(L.concentracaoCriticoPermil - 1), "concentracao_categoria")?.gravidade).toBe("atencao");
    });

    it("o texto traz a categoria, o percentual e os valores", () => {
      const s = sinal(com(700), "concentracao_categoria")!;
      expect(s.titulo).toBe("Gastos concentrados em Hospedagem");
      expect(s.detalhe).toContain("70,0%");
      expect(s.detalhe).toContain("R$ 700,00");
    });

    it("sem sinal quando há pouco gasto, poucos lançamentos ou uma categoria só", () => {
      const comTotal = (total: number) => calcular([g(total - 2, "A"), g(1, "B", "2026-10-06"), g(1, "B", "2026-10-07")]);
      expect(sinal(comTotal(L.concentracaoMinimoCentavos - 1), "concentracao_categoria")).toBeUndefined();
      expect(sinal(comTotal(L.concentracaoMinimoCentavos), "concentracao_categoria")).toBeDefined(); // o mínimo é inclusivo
      expect(sinal(calcular([g(50_000, "A"), g(10_000, "B")]), "concentracao_categoria")).toBeUndefined(); // 2 lançamentos
      expect(sinal(calcular([g(50_000, "A"), g(10_000, "A"), g(10_000, "A")]), "concentracao_categoria")).toBeUndefined(); // 1 categoria
    });
  });

  describe("ritmo de gasto", () => {
    // Base: 13 dias (01 a 13/10) a R$ 100,00 por dia; janela: 14 a 20/10.
    const base = Array.from({ length: 13 }, (_, i) => g(10_000, "Comida", `2026-10-${String(i + 1).padStart(2, "0")}`));
    const comRecente = (centavos: number) => calcular([...base, g(centavos, "Comida", "2026-10-18")]);

    it("1,5 vez a média anterior é atenção; um centavo abaixo não é nada", () => {
      expect(sinal(comRecente(105_000), "ritmo_acelerado")?.gravidade).toBe("atencao");
      expect(sinal(comRecente(104_999), "ritmo_acelerado")).toBeUndefined();
    });

    it("2,5 vezes é crítico", () => {
      expect(sinal(comRecente(175_000), "ritmo_acelerado")?.gravidade).toBe("critico");
      expect(sinal(comRecente(174_999), "ritmo_acelerado")?.gravidade).toBe("atencao");
    });

    it("o texto compara as duas médias", () => {
      const s = sinal(comRecente(175_000), "ritmo_acelerado")!;
      expect(s.detalhe).toContain("R$ 250,00 por dia");
      expect(s.detalhe).toContain("2,5 vezes");
      expect(s.detalhe).toContain("R$ 100,00 por dia");
    });

    it("não alerta com pouco gasto recente, sem base ou com base de menos de 7 dias", () => {
      expect(sinal(calcular([...base, g(L.ritmoMinimoRecenteCentavos - 1, "A", "2026-10-18")]), "ritmo_acelerado")).toBeUndefined();
      expect(sinal(calcular([g(500_000, "A", "2026-10-18")]), "ritmo_acelerado")).toBeUndefined(); // só recente
      const curta = [g(10_000, "A", "2026-10-10"), g(10_000, "A", "2026-10-13"), g(500_000, "A", "2026-10-18")]; // base de 4 dias
      expect(sinal(calcular(curta), "ritmo_acelerado")).toBeUndefined();
    });
  });

  describe("parcelas contra o que já foi gasto", () => {
    // Gasto total fixo em 100_000; as parcelas restantes variam.
    const parcelado = (restantes: number) =>
      calcular([g(100_000 - restantes / 2, "A"), g(restantes / 2, "Compras", "2026-10-06", { parcelaAtual: 1, totalParcelas: 3, compra: "p" })]);

    it("50% do gasto é atenção; 100% é crítico", () => {
      const meio = parcelado(100_000 / 2);
      expect(meio.totalCentavos).toBe(100_000);
      expect(sinal(parcelado(50_000), "parcelas_comprometem")?.gravidade).toBe("atencao");
      expect(sinal(parcelado(49_998), "parcelas_comprometem")).toBeUndefined();
      expect(sinal(parcelado(100_000), "parcelas_comprometem")?.gravidade).toBe("critico");
    });

    it("não alerta abaixo do mínimo de R$ 300 mesmo com proporção alta", () => {
      const r = calcular([g(10_000, "A"), g(5_000, "Compras", "2026-10-06", { parcelaAtual: 1, totalParcelas: 3, compra: "p" })]);
      expect(r.parcelas.restantesCentavos).toBe(10_000);
      expect(sinal(r, "parcelas_comprometem")).toBeUndefined();
    });
  });

  it("Roteiro a lançar, moeda sem cotação e dados cortados viram sinais informativos", () => {
    const r = calcular([g(10_000)], { roteiro: [{ custoCentavos: 25_000, lancado: false }], semCotacao: 2, truncado: true });
    expect(sinal(r, "roteiro_a_lancar")).toMatchObject({ gravidade: "info" });
    expect(sinal(r, "roteiro_a_lancar")?.detalhe).toContain("R$ 250,00");
    expect(sinal(r, "sem_cotacao")).toMatchObject({ gravidade: "atencao" });
    expect(sinal(r, "sem_cotacao")?.detalhe).toContain("2 lançamentos sem cotação ficaram");
    expect(sinal(r, "dados_truncados")).toMatchObject({ gravidade: "info" });
  });

  it("os sinais saem do mais grave para o menos grave", () => {
    const r = calcular(
      [g(60_000, "Hospedagem"), g(40_000, "Comida", "2026-10-06"), g(1, "Comida", "2026-10-07")],
      { roteiro: [{ custoCentavos: 1_000, lancado: false }], semCotacao: 1, truncado: true }
    );
    const ordem = r.sinais.map((s) => s.gravidade);
    expect(ordem).toEqual([...ordem].sort((a, b) => ["critico", "atencao", "info"].indexOf(a) - ["critico", "atencao", "info"].indexOf(b)));
    expect(r.sinais.length).toBeGreaterThanOrEqual(4);
  });

  it("sem nenhum motivo, nenhum sinal", () => {
    const r = calcular([g(20_000, "A", "2026-10-01"), g(20_000, "B", "2026-10-02"), g(20_000, "C", "2026-10-03")]);
    expect(r.sinais).toEqual([]);
  });
});

describe("formatação e conferência de valores", () => {
  it("reais e percentualTexto, com espaço comum", () => {
    expect(reais(123_456)).toBe("R$ 1.234,56");
    expect(reais(0)).toBe("R$ 0,00");
    expect(reais(5)).toBe("R$ 0,05");
    expect(reais(100_000_000)).toBe("R$ 1.000.000,00");
    expect(percentualTexto(625)).toBe("62,5%");
    expect(percentualTexto(1000)).toBe("100,0%");
    expect(percentualTexto(0)).toBe("0,0%");
  });

  it("extrai valores em reais de um texto, com ou sem centavos e milhar", () => {
    expect(valoresEmReaisDoTexto("R$ 1.234,56 e R$ 10 e R$12,5 e R$ 1.000")).toEqual([123_456, 1_000, 1_250, 100_000]);
    expect(valoresEmReaisDoTexto("sem valores, 50% e 3 parcelas")).toEqual([]);
  });

  it("um texto só vale se todo valor citado foi calculado pelo app", () => {
    const permitidos = new Set([123_456, 10_000]);
    expect(soCitaValoresConhecidos("Vocês gastaram R$ 1.234,56 e sobraram R$ 100.", permitidos)).toBe(true);
    expect(soCitaValoresConhecidos("Vocês gastaram R$ 1.200,00.", permitidos)).toBe(false);
    expect(soCitaValoresConhecidos("Controlem o ritmo.", permitidos)).toBe(true);
  });
});
