import { describe, expect, it } from "vitest";
import {
  LIMITES_COTA,
  RECURSOS_COTA,
  inicioDaJanela,
  mensagemCotaExcedida,
  registrarUso,
  segundosAte,
} from "./cotas-regras";

describe("janela fixa das cotas", () => {
  const hora = 3600;

  it("alinha o início da janela ao múltiplo da duração (mesma conta do SQL)", () => {
    const agora = Date.UTC(2026, 10, 4, 15, 42, 10);
    expect(inicioDaJanela(agora, hora)).toBe(Date.UTC(2026, 10, 4, 15, 0, 0));
    expect(inicioDaJanela(agora, 86_400)).toBe(Date.UTC(2026, 10, 4, 0, 0, 0));
  });

  it("conta dentro da janela e zera na seguinte", () => {
    const t0 = Date.UTC(2026, 10, 4, 15, 0, 1);
    let estado = registrarUso(undefined, t0, hora);
    estado = registrarUso(estado, t0 + 60_000, hora);
    expect(estado.contador).toBe(2);
    estado = registrarUso(estado, Date.UTC(2026, 10, 4, 16, 0, 0), hora);
    expect(estado).toEqual({ inicioMs: Date.UTC(2026, 10, 4, 16, 0, 0), contador: 1 });
  });

  it("o 31º uso de voos na mesma hora estoura o limite", () => {
    const t0 = Date.UTC(2026, 10, 4, 10, 0, 0);
    let estado = undefined as ReturnType<typeof registrarUso> | undefined;
    for (let i = 0; i < 31; i++) estado = registrarUso(estado, t0 + i * 1000, hora);
    expect(estado!.contador).toBeGreaterThan(LIMITES_COTA.voos.limite);
  });

  it("os recursos do código são exatamente os aceitos pela RPC consumir_cota", () => {
    // Mantenha em sincronia com a lista em 20261104120000_endurecimento_seguranca.sql.
    expect([...RECURSOS_COTA].sort()).toEqual(["convite", "documento", "hospedagem", "ia", "voos"]);
    for (const r of RECURSOS_COTA) {
      expect(LIMITES_COTA[r].limite).toBeGreaterThanOrEqual(1);
      expect(LIMITES_COTA[r].janelaSegundos).toBeGreaterThanOrEqual(60);
    }
  });
});

describe("mensagens e Retry-After", () => {
  it("diz o limite e o horário de Brasília em que a cota volta", () => {
    const msg = mensagemCotaExcedida("voos", new Date(Date.UTC(2026, 10, 4, 16, 0, 0)));
    expect(msg).toBe("Você atingiu o limite de 30 buscas de voos por hora. Tente de novo a partir das 13:00.");
  });

  it("Retry-After nunca é zero ou negativo", () => {
    const agora = Date.UTC(2026, 10, 4, 16, 0, 0);
    expect(segundosAte(new Date(agora + 90_500), agora)).toBe(91);
    expect(segundosAte(new Date(agora - 5000), agora)).toBe(1);
  });
});
