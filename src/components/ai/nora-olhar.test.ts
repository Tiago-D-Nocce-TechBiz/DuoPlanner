import { describe, expect, it } from "vitest";
import { calcularDeslocamento } from "./nora-olhar";

const avatar = { left: 100, top: 100, width: 20, height: 20 }; // centro (110, 110)

describe("calcularDeslocamento", () => {
  it("cursor longe à direita: pupilas no raio máximo para a direita", () => {
    const d = calcularDeslocamento(avatar, { x: 500, y: 110 }, 2);
    expect(d.x).toBeCloseTo(2);
    expect(d.y).toBeCloseTo(0);
  });

  it("cursor longe acima e à esquerda: diagonal com módulo igual ao raio", () => {
    const d = calcularDeslocamento(avatar, { x: 10, y: 10 }, 2);
    expect(d.x).toBeLessThan(0);
    expect(d.y).toBeLessThan(0);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(2);
  });

  it("cursor no centro: olhos parados", () => {
    expect(calcularDeslocamento(avatar, { x: 110, y: 110 }, 2)).toEqual({ x: 0, y: 0 });
  });

  it("cursor sobre o avatar: deslocamento proporcional, menor que o raio", () => {
    const d = calcularDeslocamento(avatar, { x: 115, y: 110 }, 2);
    expect(d.x).toBeCloseTo(0.5);
    expect(d.y).toBeCloseTo(0);
  });
});
