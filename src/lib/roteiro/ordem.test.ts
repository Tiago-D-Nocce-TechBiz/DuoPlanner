import { describe, expect, it } from "vitest";
import { ordenarDias } from "./apresentacao";
import { compararPorOrdem, diasDoMesmoGrupo, moverNoGrupo } from "./ordem";

const dia = (id: string, data: string | null, ordem: number) => ({ id, data, ordem });

describe("ordem híbrida dos dias: data primeiro, ordem manual no empate", () => {
  it("datas diferentes seguem o calendário, não a ordem manual", () => {
    expect(ordenarDias([dia("a", "2026-09-12", 0), dia("b", "2026-09-10", 5)]).map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("mesma data: vale a ordem manual; empate de ordem desempata pelo id (estável)", () => {
    const dias = [dia("c", "2026-09-10", 2), dia("a", "2026-09-10", 0), dia("b", "2026-09-10", 0), dia("d", "2026-09-11", 0)];
    expect(ordenarDias(dias).map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
    expect(ordenarDias([...dias].reverse()).map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sem nenhuma data: só a ordem manual; sem data sempre depois dos com data", () => {
    expect(ordenarDias([dia("x", null, 2), dia("y", null, 1), dia("z", "2026-09-10", 9)]).map((d) => d.id)).toEqual(["z", "y", "x"]);
    expect(ordenarDias([dia("x", null, 2), dia("y", null, 1)]).map((d) => d.id)).toEqual(["y", "x"]);
  });

  it("o grupo de um dia são os dias de mesma data (e os sem data entre si)", () => {
    const dias = [dia("a", "2026-09-10", 0), dia("b", "2026-09-10", 1), dia("c", null, 2), dia("d", null, 3)];
    expect(diasDoMesmoGrupo(dias, dias[0]).map((d) => d.id)).toEqual(["a", "b"]);
    expect(diasDoMesmoGrupo(dias, dias[2]).map((d) => d.id)).toEqual(["c", "d"]);
  });
});

describe("moverNoGrupo", () => {
  const grupo = [
    { id: "a", ordem: 0 },
    { id: "b", ordem: 1 },
    { id: "c", ordem: 2 },
  ];

  it("troca com o vizinho e devolve só o que mudou", () => {
    expect(moverNoGrupo(grupo, "b", -1)).toEqual([{ id: "b", ordem: 0 }, { id: "a", ordem: 1 }]);
    expect(moverNoGrupo(grupo, "b", 1)).toEqual([{ id: "c", ordem: 1 }, { id: "b", ordem: 2 }]);
  });

  it("na ponta ou com id desconhecido, não faz nada", () => {
    expect(moverNoGrupo(grupo, "a", -1)).toEqual([]);
    expect(moverNoGrupo(grupo, "c", 1)).toEqual([]);
    expect(moverNoGrupo(grupo, "zzz", 1)).toEqual([]);
  });

  it("reaproveita os valores de ordem do grupo (não toca em dias de outras datas)", () => {
    const entre = [{ id: "a", ordem: 3 }, { id: "b", ordem: 8 }];
    expect(moverNoGrupo(entre, "a", 1)).toEqual([{ id: "b", ordem: 3 }, { id: "a", ordem: 8 }]);
  });

  it("valores repetidos são renumerados a partir do menor, em ordem estável", () => {
    const repetidos = [{ id: "a", ordem: 4 }, { id: "b", ordem: 4 }, { id: "c", ordem: 4 }];
    const mudancas = moverNoGrupo(repetidos, "a", 1); // ordem estável: a, b, c → b, a, c
    const aplicada = repetidos.map((x) => ({ ...x, ...(mudancas.find((m) => m.id === x.id) ?? {}) })).sort(compararPorOrdem);
    expect(aplicada.map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(new Set(aplicada.map((x) => x.ordem)).size).toBe(3);
  });

  it("aplicar a mudança de fato troca a posição na lista ordenada", () => {
    const depois = grupo.map((x) => ({ ...x, ...(moverNoGrupo(grupo, "c", -1).find((m) => m.id === x.id) ?? {}) })).sort(compararPorOrdem);
    expect(depois.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});
