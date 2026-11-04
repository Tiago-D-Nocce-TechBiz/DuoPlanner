import { describe, expect, it } from "vitest";
import { crc16Pix, crcConfere, gerarPixCopiaECola, normalizarChavePix, textoPix } from "./brcode";

// Exemplo do Manual de Padrões para Iniciação do Pix (BCB): chave aleatória,
// sem valor, "Fulano de Tal", "BRASILIA", txid "***".
const EXEMPLO_BCB =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";

describe("CRC16 do BR Code", () => {
  it("reproduz o CRC do exemplo oficial do Banco Central", () => {
    expect(crc16Pix(EXEMPLO_BCB.slice(0, -4))).toBe("1D3D");
    expect(crcConfere(EXEMPLO_BCB)).toBe(true);
  });

  it("gera exatamente o payload do exemplo oficial", () => {
    expect(
      gerarPixCopiaECola({
        chave: "123e4567-e12b-12d1-a456-426655440000",
        nomeRecebedor: "Fulano de Tal",
        cidade: "BRASILIA",
      })
    ).toBe(EXEMPLO_BCB);
  });
});

describe("gerarPixCopiaECola", () => {
  it("inclui o valor com 2 casas e mantém o CRC válido", () => {
    const pix = gerarPixCopiaECola({
      chave: "+5511987654321",
      nomeRecebedor: "João da Conceição",
      cidade: "São Paulo",
      valor: 1234.5,
      txid: "DuoPlanner Acerto 01",
      descricao: "Acerto da viagem",
    });
    expect(pix).toContain("54071234.50");
    expect(pix).toContain("5917Joao da Conceicao");
    expect(pix).toContain("6009Sao Paulo");
    expect(pix).toContain("0518DuoPlannerAcerto01");
    expect(pix).toContain("0216Acerto da viagem");
    expect(crcConfere(pix)).toBe(true);
  });

  it("corta nome (25) e cidade (15) e recusa valor inválido", () => {
    const pix = gerarPixCopiaECola({
      chave: "ana@exemplo.com",
      nomeRecebedor: "Maria Aparecida dos Santos Oliveira",
      cidade: "São José dos Campos do Sul",
    });
    expect(pix).toContain("5925Maria Aparecida dos Santo");
    expect(pix).toContain("6015Sao Jose dos Ca6207");
    expect(() => gerarPixCopiaECola({ chave: "a@b.co", nomeRecebedor: "A", cidade: "B", valor: 0 })).toThrow();
  });

  it("descrição longa que não cabe no campo 26 é deixada de fora (sem quebrar o código)", () => {
    const pix = gerarPixCopiaECola({
      chave: "x".repeat(50) + "@exemplo.com",
      nomeRecebedor: "Ana",
      cidade: "Rio",
      descricao: "Uma descrição bem longa para o acerto de contas da viagem de férias",
    });
    expect(crcConfere(pix)).toBe(true);
    const tamanho26 = Number(pix.slice(pix.indexOf("26") + 2, pix.indexOf("26") + 4));
    expect(tamanho26).toBeLessThanOrEqual(99);
  });
});

describe("normalizarChavePix", () => {
  it.each([
    ["cpf", "529.982.247-25", "52998224725"],
    ["cnpj", "11.222.333/0001-81", "11222333000181"],
    ["telefone", "(11) 98765-4321", "+5511987654321"],
    ["telefone", "+55 21 99876-5432", "+5521998765432"],
    ["email", " Ana@Exemplo.COM ", "ana@exemplo.com"],
    ["aleatoria", "123E4567-E12B-12D1-A456-426655440000", "123e4567-e12b-12d1-a456-426655440000"],
  ] as const)("%s %s → %s", (tipo, bruta, esperada) => {
    expect(normalizarChavePix(tipo, bruta)).toEqual({ ok: true, chave: esperada });
  });

  it.each([
    ["cpf", "111.111.111-11"],
    ["cpf", "529.982.247-26"],
    ["cnpj", "11.222.333/0001-82"],
    ["telefone", "(11) 3456-7890"],
    ["email", "sem-arroba"],
    ["aleatoria", "123"],
  ] as const)("recusa %s %s", (tipo, bruta) => {
    expect(normalizarChavePix(tipo, bruta).ok).toBe(false);
  });
});

describe("textoPix", () => {
  it("remove acentos e símbolos fora do padrão", () => {
    expect(textoPix("Ação & Café™ — Ñandu", 40)).toBe("Acao Cafe Nandu");
    expect(textoPix("Pousada Mar-Azul / Búzios", 40)).toBe("Pousada Mar-Azul / Buzios");
  });
});
