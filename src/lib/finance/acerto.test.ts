import { describe, expect, it } from "vitest";
import { calcularAcerto, descreverRegra, valorEmReais, type LancamentoAcerto } from "./acerto";

const membros = { dono: "ana", parceiro: "bruno" };
const gasto = (pagoPor: string, valorBrl: number, proporcaoDivisao: number | null = null): LancamentoAcerto => ({
  pagoPor,
  valorBrl,
  proporcaoDivisao,
  tipo: "gasto",
});

describe("calcularAcerto", () => {
  it("50/50: quem não pagou deve a metade", () => {
    const r = calcularAcerto([gasto("ana", 100)], membros, { regra: "igual" });
    expect(r).toMatchObject({ totalGastos: 100, devedor: "parceiro", credor: "dono", valorAcerto: 50 });
  });

  it("proporcional 60/40 (renda): a parceira paga 40% do que a dona adiantou", () => {
    const r = calcularAcerto([gasto("ana", 1000)], membros, { regra: "proporcional", percentualDono: 60 });
    expect(r.parte).toEqual({ dono: 600, parceiro: 400 });
    expect(r).toMatchObject({ devedor: "parceiro", valorAcerto: 400 });
  });

  it("valor fixo: a dona cobre R$ 300 e o parceiro o restante", () => {
    const r = calcularAcerto([gasto("ana", 600), gasto("bruno", 400)], membros, { regra: "fixo", valorFixo: 300, quemCobre: "dono" });
    expect(r.parte).toEqual({ dono: 300, parceiro: 700 });
    expect(r).toMatchObject({ devedor: "parceiro", valorAcerto: 300 });
  });

  it("valor fixo pode ser do parceiro (ele cobre R$ 300; a dona, o resto)", () => {
    const r = calcularAcerto([gasto("ana", 1000)], membros, { regra: "fixo", valorFixo: 300, quemCobre: "parceiro" });
    expect(r.parte).toEqual({ dono: 700, parceiro: 300 });
    expect(r).toMatchObject({ devedor: "parceiro", valorAcerto: 300 });
  });

  it("valor fixo maior que o total: quem cobre o fixo paga tudo", () => {
    const r = calcularAcerto([gasto("bruno", 200)], membros, { regra: "fixo", valorFixo: 5000, quemCobre: "dono" });
    expect(r.parte).toEqual({ dono: 200, parceiro: 0 });
    expect(r).toMatchObject({ devedor: "dono", valorAcerto: 200 });
  });

  it("gasto com divisão própria vence a regra do casal", () => {
    // Presente que a Ana comprou só para ela, mas pagou na conta da viagem: 100% dela.
    const r = calcularAcerto([gasto("ana", 80, 100), gasto("ana", 100)], membros, { regra: "igual" });
    expect(r.parte).toEqual({ dono: 130, parceiro: 50 });
    expect(r.valorAcerto).toBe(50);
  });

  it("o pagamento do acerto zera o saldo", () => {
    const antes = calcularAcerto([gasto("ana", 100)], membros, { regra: "igual" });
    const pix: LancamentoAcerto = { pagoPor: "bruno", valorBrl: antes.valorAcerto, proporcaoDivisao: 0, tipo: "acerto" };
    const depois = calcularAcerto([gasto("ana", 100), pix], membros, { regra: "igual" });
    expect(depois).toMatchObject({ devedor: null, valorAcerto: 0, totalGastos: 100 });
    expect(depois.saldo).toEqual({ dono: 0, parceiro: 0 });
  });

  it("centavos ímpares fecham a conta (nada some no arredondamento)", () => {
    const r = calcularAcerto([gasto("ana", 0.01), gasto("bruno", 33.33)], membros, { regra: "proporcional", percentualDono: 33.3 });
    expect(Math.round((r.parte.dono + r.parte.parceiro) * 100)).toBe(3334);
    expect(Math.round((r.saldo.dono + r.saldo.parceiro) * 100)).toBe(0);
  });

  it("quem pagou fora do espaço é ignorado e contado", () => {
    const r = calcularAcerto([gasto("ex-membro", 50), gasto("ana", 10)], membros, { regra: "igual" });
    expect(r).toMatchObject({ ignorados: 1, totalGastos: 10 });
  });
});

describe("valorEmReais e descrição", () => {
  it("converte moeda estrangeira pela cotação registrada", () => {
    expect(valorEmReais({ valor: 25.5, moeda: "USD", cotacaoBrl: 5.4321 })).toBe(138.52);
    expect(valorEmReais({ valor: 10, moeda: "BRL", cotacaoBrl: null })).toBe(10);
    expect(valorEmReais({ valor: 10, moeda: "EUR", cotacaoBrl: null })).toBeNull();
  });

  it("descreve a regra com os nomes", () => {
    const nomes = { dono: "Ana", parceiro: "Bruno" };
    expect(descreverRegra({ regra: "igual" }, nomes)).toBe("Divisão igual (50/50)");
    expect(descreverRegra({ regra: "proporcional", percentualDono: 60 }, nomes)).toBe("Ana 60% · Bruno 40%");
    expect(descreverRegra({ regra: "fixo", valorFixo: 3000, quemCobre: "dono" }, nomes)).toMatch(/^Ana cobre R\$\s3\.000,00; Bruno, o restante$/);
    expect(descreverRegra({ regra: "fixo", valorFixo: 500, quemCobre: "parceiro" }, nomes)).toMatch(/^Bruno cobre R\$\s500,00; Ana, o restante$/);
  });
});
