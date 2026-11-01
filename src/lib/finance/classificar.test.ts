import { describe, expect, it } from "vitest";
import { classificarDespesa, normalizarTexto } from "./classificar";

describe("normalizarTexto", () => {
  it("remove acentos e símbolos e marca as pontas", () => {
    expect(normalizarTexto("Viação Útil*SP")).toBe(" viacao util sp ");
  });
});

describe("classificarDespesa — vazamentos por trecho de palavra (T3)", () => {
  // Antes, "util", "mercado", "99", "azul", "posto" e "show" casavam como
  // trecho e mandavam gastos pessoais para a divisão da viagem.
  it.each([
    "UTILIDADES DOMESTICAS",
    "MERCADOLIVRE*VENDEDOR",
    "Mercado Pago*Fulano",
    "LOJA 99",
    "AZUL SEGUROS",
    "IMPOSTO DE RENDA",
    "SHOWROOM MOVEIS",
    "Golden Academia",
    "Farmácia Azul",
  ])("%s fica pessoal e privado", (titulo) => {
    expect(classificarDespesa(titulo)).toEqual({
      categoria: "Gasto Pessoal (Fora da Viagem)",
      escopo: "pessoal_privado",
    });
  });
});

describe("classificarDespesa — gastos da viagem", () => {
  it.each([
    ["AZUL LINHAS AEREAS", "Passagens & Transporte"],
    ["GOL LINHAS AEREAS", "Passagens & Transporte"],
    ["LATAM AIRLINES", "Passagens & Transporte"],
    ["99APP *RIDE", "Passagens & Transporte"],
    ["UBER *TRIP", "Passagens & Transporte"],
    ["Viação Útil", "Passagens & Transporte"],
    ["Seguro Viagem Assist Card", "Passagens & Transporte"],
    ["AIRBNB * HMXYZ", "Hospedagem"],
    ["Booking.com", "Hospedagem"],
    ["UBER *EATS", "Alimentação & Gastronomia"],
    ["IFD*RESTAURANTE SABOR", "Alimentação & Gastronomia"],
    ["Restaurante Coco Bambu", "Alimentação & Gastronomia"],
    ["Ingresso Beto Carrero", "Passeios & Lazer"],
  ])("%s → %s, compartilhado", (titulo, categoria) => {
    expect(classificarDespesa(titulo)).toEqual({ categoria, escopo: "viagem_compartilhado" });
  });

  it("usa a categoria do banco só quando a descrição não basta", () => {
    expect(classificarDespesa("OUTBACK STEAKHOUSE", "Restaurante")).toEqual({
      categoria: "Alimentação & Gastronomia",
      escopo: "viagem_compartilhado",
    });
    expect(classificarDespesa("Hotel Fasano", "Serviços").categoria).toBe("Hospedagem");
  });

  it("desconhecido fica privado (na dúvida, privado)", () => {
    expect(classificarDespesa("PAG*JoseDaSilva").escopo).toBe("pessoal_privado");
  });
});
