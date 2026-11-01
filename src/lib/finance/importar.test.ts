import { describe, expect, it } from "vitest";
import { importarExtrato, parseDataLancamento, parseValorMonetario } from "./importar";

const HOJE = "2026-11-01";

describe("parseValorMonetario", () => {
  it.each([
    ["25,90", 25.9],
    ["25.90", 25.9], // T2: ponto decimal não pode virar 2590
    ["R$ 25,90", 25.9],
    ["R$25,90", 25.9],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234", 1234],
    ["12.345.678,90", 12345678.9],
    ["120", 120],
    ["0,99", 0.99],
    ["-25,90", -25.9],
    ["−25,90", -25.9],
    ["(25,90)", -25.9],
    ["25,90-", -25.9],
    ["R$ -25,90", -25.9],
    ["-R$ 25,90", -25.9],
    ["+10,00", 10],
  ])("%s → %d", (entrada, esperado) => {
    expect(parseValorMonetario(entrada)).toBe(esperado);
  });

  it.each(["", "abc", "01/10/2026", "2026-10-01", "1.23,45", "12,34,56", "1234.5678", "US$ 10,00", "25,"])(
    "rejeita %s",
    (entrada) => {
      expect(parseValorMonetario(entrada)).toBeNull();
    }
  );
});

describe("parseDataLancamento", () => {
  it.each([
    ["2026-10-05", "2026-10-05"],
    ["2026-10-05T14:30:00", "2026-10-05"],
    ["05/10/2026", "2026-10-05"],
    ["05/10/26", "2026-10-05"],
    ["05.10.2026", "2026-10-05"],
    ["05/10", "2026-10-05"],
    ["01/11", "2026-11-01"], // hoje
    ["15/12", "2025-12-15"], // sem ano e no futuro: fatura do ano passado
    ["05 OUT", "2026-10-05"],
    ["5 de março de 2026", "2026-03-05"],
    ["20 dez", "2025-12-20"],
  ])("%s → %s", (entrada, esperado) => {
    expect(parseDataLancamento(entrada, HOJE)).toBe(esperado);
  });

  it.each(["31/02/2026", "32/01", "12.10", "05 outback", "Padaria"])("rejeita %s", (entrada) => {
    expect(parseDataLancamento(entrada, HOJE)).toBeNull();
  });
});

describe("importarExtrato — fatura de cartão (T2)", () => {
  it("lê CSV de 3 colunas (date,title,amount) com ponto decimal", () => {
    const csv = [
      "date,title,amount",
      "2026-10-01,Padaria Pão Quente,25.90",
      '2026-10-05,"Uber *Trip",23.45',
      "2026-10-08,Pagamento recebido,-1000.00",
      "2026-10-10,Estorno Loja X,-50.00",
    ].join("\n");
    const r = importarExtrato(csv, HOJE);
    expect(r.formato).toBe("cartao");
    expect(r.itens).toEqual([
      { linha: 2, dataIso: "2026-10-01", titulo: "Padaria Pão Quente", valor: 25.9 },
      { linha: 3, dataIso: "2026-10-05", titulo: "Uber *Trip", valor: 23.45 },
    ]);
    expect(r.ignoradas.map((l) => l.linha)).toEqual([4, 5]);
  });

  it("lê o formato antigo de 4 colunas, com e sem aspas no valor", () => {
    const csv = [
      "data,categoria,titulo,valor",
      '01/10/2026,Alimentação,Restaurante na orla,"120,50"',
      "02/10/2026,Alimentação,Sorveteria,18,90",
    ].join("\n");
    const r = importarExtrato(csv, HOJE);
    expect(r.itens.map((i) => [i.titulo, i.valor, i.dataIso, i.categoriaBanco])).toEqual([
      ["Restaurante na orla", 120.5, "2026-10-01", "Alimentação"],
      ["Sorveteria", 18.9, "2026-10-02", "Alimentação"],
    ]);
  });

  it("lê 4 colunas sem cabeçalho", () => {
    const r = importarExtrato("01/10/2026;Alimentação;Padaria;25,90", HOJE);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ titulo: "Padaria", valor: 25.9, dataIso: "2026-10-01" });
  });

  it("lê texto colado: R$ 25,90 continua 25,90", () => {
    const texto = [
      "Restaurante na orla  R$ 120,00",
      "05/10 UBER *TRIP 23,45",
      "Jantar - R$ 25,90",
      "Sorvete 12.50",
      "Agência 1234 Conta 5678",
      "COMPRAS NACIONAIS",
      "Estorno Loja X 50,00",
      "Saldo anterior 1.000,00",
    ].join("\n");
    const r = importarExtrato(texto, HOJE);
    expect(r.formato).toBe("texto");
    expect(r.itens.map((i) => [i.titulo, i.valor, i.dataIso])).toEqual([
      ["Restaurante na orla", 120, HOJE],
      ["UBER *TRIP", 23.45, "2026-10-05"],
      ["Jantar", 25.9, HOJE],
      ["Sorvete", 12.5, HOJE],
    ]);
    // "COMPRAS NACIONAIS" não tem número: pulada sem aviso.
    expect(r.ignoradas.map((l) => [l.linha, l.motivo])).toEqual([
      [5, "valor sem centavos nem R$ (ex.: 25,00)"],
      [7, "estorno (devolução de compra)"],
      [8, "linha de saldo ou total"],
    ]);
  });

  it("prefere a coluna em reais quando a fatura traz dólar e real", () => {
    const csv = [
      "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)",
      "01/10/2026;TIAGO;1234;Restaurante;OUTBACK STEAKHOUSE;Única;0;0;189,90",
      "03/10/2026;TIAGO;1234;Serviços;AMAZON WEB SERVICES;Única;10,00;5,40;54,00",
    ].join("\n");
    const r = importarExtrato(csv, HOJE);
    expect(r.itens.map((i) => [i.titulo, i.valor, i.categoriaBanco])).toEqual([
      ["OUTBACK STEAKHOUSE", 189.9, "Restaurante"],
      ["AMAZON WEB SERVICES", 54, "Serviços"],
    ]);
  });

  it("junta '25,90' sem aspas em CSV de vírgula sem cabeçalho", () => {
    const r = importarExtrato("01/10/2026,Padaria,25,90", HOJE);
    expect(r.itens).toEqual([{ linha: 1, dataIso: "2026-10-01", titulo: "Padaria", valor: 25.9 }]);
  });

  it("separa título e valor colados por vírgula e pula moeda estrangeira e totais", () => {
    const r = importarExtrato(
      ["Padaria,R$ 25,90", "Amazon US$ 10,00", "Total da fatura R$ 1.234,56", "Pagamento recebido R$ 500,00"].join("\n"),
      HOJE
    );
    expect(r.itens.map((i) => [i.titulo, i.valor])).toEqual([["Padaria", 25.9]]);
    expect(r.ignoradas.map((l) => l.motivo)).toEqual([
      "valor em moeda estrangeira",
      "linha de saldo ou total",
      "pagamento da fatura (não é gasto novo)",
    ]);
  });

  it("aceita BOM, CRLF e linhas vazias", () => {
    const r = importarExtrato("\uFEFFdate,title,amount\r\n\r\n2026-10-01,Padaria,25.90\r\n", HOJE);
    expect(r.itens).toEqual([{ linha: 3, dataIso: "2026-10-01", titulo: "Padaria", valor: 25.9 }]);
  });
});

describe("importarExtrato — extrato de conta", () => {
  it("Nubank conta: saídas negativas viram gastos, entradas são puladas", () => {
    const csv = [
      "Data,Valor,Identificador,Descrição",
      "01/10/2026,-25.90,6512ab4c-1f2e-4d5a-9b8c-7d6e5f4a3b2c,Compra no débito - Padaria",
      "02/10/2026,3500.00,7612ab4c-1f2e-4d5a-9b8c-7d6e5f4a3b2c,Transferência recebida - Empresa",
      "03/10/2026,-120.00,8712ab4c-1f2e-4d5a-9b8c-7d6e5f4a3b2c,Pix enviado - Pousada Mar Azul",
    ].join("\n");
    const r = importarExtrato(csv, HOJE);
    expect(r.formato).toBe("conta");
    expect(r.itens.map((i) => [i.titulo, i.valor])).toEqual([
      ["Compra no débito - Padaria", 25.9],
      ["Pix enviado - Pousada Mar Azul", 120],
    ]);
    expect(r.ignoradas).toEqual([
      {
        linha: 3,
        texto: "02/10/2026,3500.00,7612ab4c-1f2e-4d5a-9b8c-7d6e5f4a3b2c,Transferência recebida - Empresa",
        motivo: "entrada na conta (valor positivo)",
      },
    ]);
  });

  it("Inter: usa a coluna Valor, não o Saldo, e pula pagamento de fatura", () => {
    const csv = [
      "Data Lançamento;Histórico;Descrição;Valor;Saldo",
      "01/10/2026;Compra no débito;Padaria Pão Quente;-25,90;1.234,56",
      "02/10/2026;Pix recebido;Fulano;100,00;1.334,56",
      "03/10/2026;Pagamento de fatura;Cartão;-500,00;834,56",
    ].join("\n");
    const r = importarExtrato(csv, HOJE);
    expect(r.formato).toBe("conta");
    expect(r.itens).toEqual([
      { linha: 2, dataIso: "2026-10-01", titulo: "Compra no débito · Padaria Pão Quente", valor: 25.9 },
    ]);
    expect(r.ignoradas.map((l) => [l.linha, l.motivo])).toEqual([
      [3, "entrada na conta (valor positivo)"],
      [4, "pagamento da fatura (não é gasto novo)"],
    ]);
  });

  it("texto colado de extrato: negativos são gastos, Pix recebido fica de fora", () => {
    const texto = ["01/10 Compra Padaria -25,90", "02/10 Pix recebido 100,00", "03/10 Uber -15,00"].join("\n");
    const r = importarExtrato(texto, HOJE);
    expect(r.formato).toBe("conta");
    expect(r.itens.map((i) => [i.titulo, i.valor, i.dataIso])).toEqual([
      ["Compra Padaria", 25.9, "2026-10-01"],
      ["Uber", 15, "2026-10-03"],
    ]);
    expect(r.ignoradas.map((l) => [l.linha, l.motivo])).toEqual([[2, "entrada na conta (valor positivo)"]]);
  });

  it("dd/mm sem ano no futuro vai para o ano anterior", () => {
    const r = importarExtrato("data;descrição;valor\n15/12;Ceia;250,00", HOJE);
    expect(r.itens[0].dataIso).toBe("2025-12-15");
  });

  it("data inválida em CSV com cabeçalho é reportada, não inventada", () => {
    const r = importarExtrato("date,title,amount\n2026-13-01,Padaria,25.90", HOJE);
    expect(r.itens).toEqual([]);
    expect(r.ignoradas[0].motivo).toBe("data não reconhecida");
  });
});
