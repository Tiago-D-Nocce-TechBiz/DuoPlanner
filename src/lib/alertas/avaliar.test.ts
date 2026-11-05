import { describe, expect, it } from "vitest";
import { decidirAviso, type EstadoAvisos } from "./avaliar";

const AGORA = Date.parse("2026-11-10T11:00:00Z");
const diasAtras = (d: number) => new Date(AGORA - d * 86_400_000).toISOString();
const novo: EstadoAvisos = { precoAlvo: 3000, ultimoPrecoNotificado: null, ultimoDisparoEm: null };

describe("quando avisar por e-mail que o preço chegou ao alvo", () => {
  it("sem alvo só registra o preço", () => {
    expect(decidirAviso(100, { ...novo, precoAlvo: null }, AGORA)).toMatchObject({ notificar: false, motivo: "sem_alvo" });
  });

  it("primeira vez no alvo (ou exatamente nele) avisa", () => {
    expect(decidirAviso(2900, novo, AGORA)).toMatchObject({ notificar: true, motivo: "primeiro_aviso", precoAnterior: null });
    expect(decidirAviso(3000, novo, AGORA)).toMatchObject({ notificar: true });
  });

  it("acima do alvo não avisa e rearma quem já tinha sido avisado", () => {
    expect(decidirAviso(3000.01, novo, AGORA)).toEqual({ notificar: false, motivo: "acima_do_alvo", rearmar: false });
    const avisado = { ...novo, ultimoPrecoNotificado: 2800, ultimoDisparoEm: diasAtras(1) };
    expect(decidirAviso(3200, avisado, AGORA)).toEqual({ notificar: false, motivo: "acima_do_alvo", rearmar: true });
  });

  it("o mesmo preço nunca gera dois e-mails", () => {
    const avisado = { ...novo, ultimoPrecoNotificado: 2800, ultimoDisparoEm: diasAtras(10) };
    expect(decidirAviso(2800, avisado, AGORA)).toMatchObject({ notificar: false, motivo: "sem_queda" });
    expect(decidirAviso(2850, avisado, AGORA)).toMatchObject({ notificar: false, motivo: "sem_queda" });
  });

  it("queda de 5% ou mais avisa na hora, mesmo dentro dos 3 dias", () => {
    const ontem = { ...novo, ultimoPrecoNotificado: 2800, ultimoDisparoEm: diasAtras(1) };
    expect(decidirAviso(2660, ontem, AGORA)).toMatchObject({ notificar: true, motivo: "nova_queda", precoAnterior: 2800 });
    expect(decidirAviso(2661, ontem, AGORA)).toMatchObject({ notificar: false, motivo: "aguardando_intervalo" });
  });

  it("queda pequena só avisa depois de 3 dias do último e-mail", () => {
    const estado = (dias: number) => ({ ...novo, ultimoPrecoNotificado: 2800, ultimoDisparoEm: diasAtras(dias) });
    expect(decidirAviso(2750, estado(2.9), AGORA)).toMatchObject({ notificar: false, motivo: "aguardando_intervalo" });
    expect(decidirAviso(2750, estado(3), AGORA)).toMatchObject({ notificar: true, motivo: "abaixo_do_ultimo_aviso" });
  });

  it("voltou ao alvo depois de subir: avisa de novo respeitando o intervalo", () => {
    const rearmado = { ...novo, ultimoPrecoNotificado: null, ultimoDisparoEm: diasAtras(1) };
    expect(decidirAviso(2900, rearmado, AGORA)).toMatchObject({ notificar: false, motivo: "aguardando_intervalo", rearmar: false });
    expect(decidirAviso(2900, { ...rearmado, ultimoDisparoEm: diasAtras(4) }, AGORA)).toMatchObject({
      notificar: true,
      motivo: "voltou_ao_alvo",
    });
  });

  it("compara em centavos (sem erro de ponto flutuante)", () => {
    expect(decidirAviso(0.1 + 0.2, { ...novo, precoAlvo: 0.3 }, AGORA)).toMatchObject({ notificar: true });
  });
});
