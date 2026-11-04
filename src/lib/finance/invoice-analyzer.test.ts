import { describe, expect, it } from "vitest";
import {
  analisarFatura,
  calcularRaioX,
  detectarParcela,
  enriquecerPeloDicionario,
  limparNomeEstabelecimento,
} from "./invoice-analyzer";

const HOJE = "2026-11-01";

describe("detectarParcela", () => {
  it("detecta 01/10 e calcula saldo futuro", () => {
    const p = detectarParcela("MAGAZINE LUIZA PARC 01/10", 120);
    expect(p.isInstallment).toBe(true);
    expect(p.currentInstallment).toBe(1);
    expect(p.totalInstallments).toBe(10);
    expect(p.installmentAmount).toBe(120);
    expect(p.totalPurchaseAmount).toBe(1200);
    expect(p.remainingMonths).toBe(9);
    expect(p.remainingAmount).toBe(1080);
  });

  it("detecta PARC 3/12", () => {
    const p = detectarParcela("CASAS BAHIA PARC 3/12", 100);
    expect(p).toMatchObject({ isInstallment: true, currentInstallment: 3, totalInstallments: 12 });
    expect(p.remainingAmount).toBe(900); // 100 × (12 - 3)
  });

  it("detecta 'Parcela 3 de 6'", () => {
    const p = detectarParcela("Loja X Parcela 3 de 6", 50);
    expect(p).toMatchObject({ currentInstallment: 3, totalInstallments: 6, remainingMonths: 3 });
  });

  it("detecta '3x' / '3x de 10'", () => {
    expect(detectarParcela("Eletronicos 3x de 10", 10)).toMatchObject({
      currentInstallment: 3,
      totalInstallments: 10,
    });
  });

  it("última parcela não deixa saldo futuro", () => {
    const p = detectarParcela("Loja 10/10", 120);
    expect(p.remainingMonths).toBe(0);
    expect(p.remainingAmount).toBe(0);
  });

  it("não confunde a data inicial do texto livre com parcela", () => {
    // "05/10" logo no começo é a data do lançamento, não 5 de 10 parcelas.
    expect(detectarParcela("05/10 Uber Trip", 23.45).isInstallment).toBe(false);
  });

  it("ignora padrões implausíveis (atual > total, total absurdo)", () => {
    expect(detectarParcela("Loja 11/10", 10).isInstallment).toBe(false);
    expect(detectarParcela("Pedido 12/99", 10).isInstallment).toBe(false);
  });
});

describe("limparNomeEstabelecimento", () => {
  it("remove prefixo PG * e URL de suporte", () => {
    expect(limparNomeEstabelecimento("PG *UBER *TRIP HELP.UBER.COM")).toBe("Uber Trip");
  });

  it("remove prefixo MP * (Mercado Pago)", () => {
    expect(limparNomeEstabelecimento("MP *MERCADOLIVRE")).toBe("Mercadolivre");
  });

  it("remove prefixo IFD*", () => {
    expect(limparNomeEstabelecimento("IFD*IFOOD")).toBe("Ifood");
  });

  it("remove o trecho de parcela do nome", () => {
    expect(limparNomeEstabelecimento("MAGAZINE LUIZA PARC 02/10")).toBe("Magazine Luiza");
  });
});

describe("enriquecerPeloDicionario (fallback local)", () => {
  it("mapeia Uber para Transporte / corrida, compartilhado", () => {
    const e = enriquecerPeloDicionario("PG *UBER *TRIP", "Uber Trip");
    expect(e.cleanMerchantName).toBe("Uber");
    expect(e.whatWasBought).toBe("Corrida de aplicativo");
    expect(e.category).toBe("Transporte");
    expect(e.suggestedScope).toBe("compartilhado");
  });

  it("mapeia iFood para Alimentação / delivery", () => {
    expect(enriquecerPeloDicionario("IFD*IFOOD", "Ifood").category).toBe("Alimentação");
  });

  it("mapeia Netflix para Assinaturas, privado", () => {
    const e = enriquecerPeloDicionario("NETFLIX.COM", "Netflix");
    expect(e.category).toBe("Assinaturas");
    expect(e.suggestedScope).toBe("pessoal_privado");
  });

  it("mapeia Drogasil para Saúde & Farmácia, privado", () => {
    expect(enriquecerPeloDicionario("DROGASIL 123", "Drogasil")).toMatchObject({
      category: "Saúde & Farmácia",
      suggestedScope: "pessoal_privado",
    });
  });

  it("mapeia IOF para Taxas & Impostos", () => {
    expect(enriquecerPeloDicionario("IOF TRANSACAO EXTERIOR", "IOF").category).toBe("Taxas & Impostos");
  });

  it("desconhecido cai em Outros e privado (padrão seguro)", () => {
    const e = enriquecerPeloDicionario("LOJA DESCONHECIDA XYZ", "Loja Desconhecida Xyz");
    expect(e.category).toBe("Outros");
    expect(e.suggestedScope).toBe("pessoal_privado");
  });
});

describe("analisarFatura — pipeline determinístico", () => {
  const csv = [
    "date,title,amount",
    "2026-10-01,PG *UBER *TRIP,23.45",
    "2026-10-03,IFD*IFOOD,55.00",
    "2026-10-05,MAGAZINE LUIZA PARC 02/10,120.00",
    "2026-10-08,Pagamento recebido,-1000.00",
    "2026-10-10,Estorno Loja X,-50.00",
  ].join("\n");

  it("separa compras de pagamentos e estornos", () => {
    const r = analisarFatura(csv, HOJE);
    expect(r.transacoes).toHaveLength(3);
    expect(r.ignoradas.map((l) => l.linha).sort()).toEqual([5, 6]);
  });

  it("deriva a referência da fatura (mês mais frequente)", () => {
    expect(analisarFatura(csv, HOJE).faturaReferencia).toBe("2026-10");
  });

  it("marca a compra parcelada e limpa o nome", () => {
    const r = analisarFatura(csv, HOJE);
    const parcelada = r.transacoes.find((t) => t.installmentInfo.isInstallment);
    expect(parcelada?.cleanMerchantName).toBe("Magazine Luiza");
    expect(parcelada?.installmentInfo).toMatchObject({
      currentInstallment: 2,
      totalInstallments: 10,
      totalPurchaseAmount: 1200,
    });
  });
});

describe("calcularRaioX", () => {
  it("agrega total, à vista, parcelado e comprometimento futuro", () => {
    const r = analisarFatura(
      [
        "date,title,amount",
        "2026-10-01,PG *UBER *TRIP,20.00",
        "2026-10-03,IFD*IFOOD,30.00",
        "2026-10-05,MAGAZINE LUIZA PARC 02/10,100.00",
      ].join("\n"),
      HOJE
    );
    const x = calcularRaioX(r.transacoes);
    expect(x.totalFatura).toBe(150); // 20 + 30 + 100
    expect(x.totalAVista).toBe(50); // Uber + iFood
    expect(x.qtdAVista).toBe(2);
    expect(x.totalParceladoMes).toBe(100);
    expect(x.qtdParcelada).toBe(1);
    expect(x.comprometimentoFuturo).toBe(800); // 100 × (10 - 2)
    // Percentuais e por-categoria
    const alimentacao = x.porCategoria.find((c) => c.category === "Alimentação");
    expect(alimentacao?.quantidade).toBe(1);
  });

  it("ignora transações marcadas com ignorarNoCalculo", () => {
    const r = analisarFatura("date,title,amount\n2026-10-01,Uber,20.00", HOJE);
    const transacoes = r.transacoes.map((t) => ({ ...t, ignorarNoCalculo: true }));
    expect(calcularRaioX(transacoes).totalFatura).toBe(0);
  });
});
