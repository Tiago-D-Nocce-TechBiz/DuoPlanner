import { describe, expect, it } from "vitest";
import { interpretarBusca } from "./concierge";

const HOJE = "2026-11-01";

describe("interpretarBusca — datas de viagem (T4)", () => {
  it("dd/mm já passado vai para o próximo ano", () => {
    const r = interpretarBusca("de BH para Salvador 10/07 a 15/07", HOJE);
    expect([r.departDate, r.returnDate]).toEqual(["2027-07-10", "2027-07-15"]);
  });

  it("dd/mm ainda por vir fica no ano atual", () => {
    const r = interpretarBusca("de BH para o Rio 20/11 a 25/11", HOJE);
    expect([r.departDate, r.returnDate]).toEqual(["2026-11-20", "2026-11-25"]);
  });

  it("virada de ano: a volta nunca fica antes da ida", () => {
    const r = interpretarBusca("de SP para Recife 28/12 a 03/01", "2026-01-02");
    expect([r.departDate, r.returnDate]).toEqual(["2026-12-28", "2027-01-03"]);
  });

  it("'08 a 15/07' usa o mês do segundo dia", () => {
    const r = interpretarBusca("de BH para Búzios, 08 a 15/07, 2 pessoas", HOJE);
    expect(r).toMatchObject({
      departDate: "2027-07-08",
      returnDate: "2027-07-15",
      passengers: 2,
      destinationIata: "CFB",
    });
  });

  it("'28 a 03/01' começa no mês anterior", () => {
    const r = interpretarBusca("de SP para Natal 28 a 03/01", HOJE);
    expect([r.departDate, r.returnDate]).toEqual(["2026-12-28", "2027-01-03"]);
  });

  it("intervalo sem ano que já começou vai para o ano que vem", () => {
    const r = interpretarBusca("de SP para Natal 08 a 15/07", "2026-07-10");
    expect([r.departDate, r.returnDate]).toEqual(["2027-07-08", "2027-07-15"]);
  });

  it("data com ano explícito é respeitada", () => {
    expect(interpretarBusca("de SP para Natal 10/07/2027", HOJE).departDate).toBe("2027-07-10");
  });

  it("data impossível é ignorada", () => {
    expect(interpretarBusca("de SP para Natal 31/02", HOJE).departDate).toBeUndefined();
  });

  it.each([
    ["em dezembro", "2026-12-01"],
    ["em novembro", HOJE],
    ["em março", "2027-03-01"],
  ])("mês por extenso: %s → %s", (trecho, esperado) => {
    expect(interpretarBusca(`passagem de SP pra Salvador ${trecho}`, HOJE).departDate).toBe(esperado);
  });
});

describe("interpretarBusca — destino", () => {
  it("frase sem cidade conhecida não vira destino", () => {
    const r = interpretarBusca("Hotel custou 300 reais", HOJE);
    expect(r.destinationCity).toBeUndefined();
    expect(r.destinationIata).toBeUndefined();
  });

  it("cidade conhecida sozinha vira destino", () => {
    expect(interpretarBusca("Fortaleza", HOJE)).toMatchObject({
      destinationCity: "Fortaleza",
      destinationIata: "FOR",
    });
  });

  it("conceito por palavra inteira, o mais específico primeiro", () => {
    expect(interpretarBusca("uma praia no nordeste", HOJE).destinationCity).toBe("Salvador");
    expect(interpretarBusca("resultado da consulta", HOJE).destinationCity).toBeUndefined();
  });
});
