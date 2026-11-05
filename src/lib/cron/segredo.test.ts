import { describe, expect, it } from "vitest";
import { verificarSegredoCron } from "./segredo";

const SEGREDO = "s3gredo-bem-comprido-123";

describe("autorização das tarefas agendadas", () => {
  it("sem segredo configurado (ou curto demais) recusa tudo", () => {
    expect(verificarSegredoCron(`Bearer ${SEGREDO}`, undefined)).toBe("sem_segredo");
    expect(verificarSegredoCron("Bearer curto", "curto")).toBe("sem_segredo");
  });

  it("aceita só o Bearer exato", () => {
    expect(verificarSegredoCron(`Bearer ${SEGREDO}`, SEGREDO)).toBe("ok");
    expect(verificarSegredoCron(null, SEGREDO)).toBe("negado");
    expect(verificarSegredoCron(SEGREDO, SEGREDO)).toBe("negado");
    expect(verificarSegredoCron(`Bearer ${SEGREDO}x`, SEGREDO)).toBe("negado");
    expect(verificarSegredoCron(`bearer ${SEGREDO}`, SEGREDO)).toBe("negado");
  });
});
