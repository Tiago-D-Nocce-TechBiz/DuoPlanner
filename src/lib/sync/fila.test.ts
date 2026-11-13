import { describe, expect, it } from "vitest";
import { derivar, enfileirar, type Operacao } from "./fila";

const nenhumNoServidor = () => false;
const todosNoServidor = () => true;
let seq = 0;
// Omit distributivo: preserva os campos de cada variante da união.
type SemOpId<T> = T extends unknown ? Omit<T, "opId"> : never;
const op = (o: SemOpId<Operacao>): Operacao => ({ ...o, opId: `op-${++seq}` }) as Operacao;

describe("enfileirar (combina operações ainda não enviadas)", () => {
  it("várias edições do mesmo item viram uma só", () => {
    let fila: Operacao[] = [];
    for (const titulo of ["M", "Mu", "Museu"]) {
      fila = enfileirar(fila, op({ recurso: "roteiro_itens", tipo: "atualizar", id: "i1", campos: { titulo } }), new Set(), todosNoServidor);
    }
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ tipo: "atualizar", campos: { titulo: "Museu" } });
  });

  it("edição logo após criar entra no próprio registro criado", () => {
    let fila = enfileirar([], op({ recurso: "checklist", tipo: "criar", registro: { id: "c1", texto: "Pass", feito: false } }), new Set(), nenhumNoServidor);
    fila = enfileirar(fila, op({ recurso: "checklist", tipo: "atualizar", id: "c1", campos: { texto: "Passaporte", feito: true } }), new Set(), nenhumNoServidor);
    expect(fila).toEqual([expect.objectContaining({ tipo: "criar", registro: { id: "c1", texto: "Passaporte", feito: true } })]);
  });

  it("criar e apagar antes de sincronizar não envia nada", () => {
    let fila = enfileirar([], op({ recurso: "despesas", tipo: "criar", registro: { id: "d1" } }), new Set(), nenhumNoServidor);
    fila = enfileirar(fila, op({ recurso: "despesas", tipo: "remover", id: "d1" }), new Set(), nenhumNoServidor);
    expect(fila).toEqual([]);
  });

  it("se a criação já está em voo, o remover precisa ir", () => {
    const criar = op({ recurso: "despesas", tipo: "criar", registro: { id: "d1" } });
    const fila = enfileirar([criar], op({ recurso: "despesas", tipo: "remover", id: "d1" }), new Set([criar.opId]), nenhumNoServidor);
    expect(fila.map((o) => o.tipo)).toEqual(["criar", "remover"]);
  });

  it("edição depois de uma operação em voo vai ao fim (não altera o que já saiu)", () => {
    const enviada = op({ recurso: "checklist", tipo: "atualizar", id: "c1", campos: { feito: true } });
    const fila = enfileirar([enviada], op({ recurso: "checklist", tipo: "atualizar", id: "c1", campos: { feito: false } }), new Set([enviada.opId]), todosNoServidor);
    expect(fila).toHaveLength(2);
    expect(fila[0]).toBe(enviada);
  });

  it("desfazer uma remoção pendente de algo que existe no servidor vira atualização", () => {
    const remover = op({ recurso: "despesas", tipo: "remover", id: "d1" });
    const fila = enfileirar([remover], op({ recurso: "despesas", tipo: "criar", registro: { id: "d1", descricao: "Jantar", userId: "u", tipo: "gasto" } }), new Set(), todosNoServidor);
    expect(fila).toEqual([expect.objectContaining({ tipo: "atualizar", id: "d1", campos: { descricao: "Jantar" } })]);
  });

  it("edição de algo que vai ser apagado é ignorada", () => {
    const remover = op({ recurso: "despesas", tipo: "remover", id: "d1" });
    const fila = enfileirar([remover], op({ recurso: "despesas", tipo: "atualizar", id: "d1", campos: { valor: 1 } }), new Set(), todosNoServidor);
    expect(fila).toEqual([remover]);
  });
});

describe("derivar (snapshot do servidor + fila)", () => {
  it("aplica criar, atualizar e remover em ordem", () => {
    const servidor = new Map([
      ["a", { id: "a", texto: "A", feito: false }],
      ["b", { id: "b", texto: "B", feito: false }],
    ]);
    const fila: Operacao[] = [
      op({ recurso: "checklist", tipo: "atualizar", id: "a", campos: { feito: true } }),
      op({ recurso: "checklist", tipo: "remover", id: "b" }),
      op({ recurso: "checklist", tipo: "criar", registro: { id: "c", texto: "C", feito: false } }),
      op({ recurso: "despesas", tipo: "remover", id: "a" }), // outro recurso: não afeta
    ];
    expect(derivar(servidor, fila, "checklist")).toEqual([
      { id: "a", texto: "A", feito: true },
      { id: "c", texto: "C", feito: false },
    ]);
    expect(servidor.get("b")).toBeDefined(); // o snapshot não é alterado
  });

  it("atualização de registro desconhecido não cria fantasma", () => {
    expect(derivar(new Map(), [op({ recurso: "checklist", tipo: "atualizar", id: "x", campos: { feito: true } })], "checklist")).toEqual([]);
  });

  it("registro que não mudou mantém a mesma referência entre derivações (as linhas memoizadas não redesenham)", () => {
    const servidor = new Map([["s", { id: "s", texto: "Do servidor", feito: false }]]);
    const criarA = op({ recurso: "checklist", tipo: "criar", registro: { id: "a", texto: "A", feito: false } });
    const criarB = op({ recurso: "checklist", tipo: "criar", registro: { id: "b", texto: "B", feito: false } });
    const editarS = op({ recurso: "checklist", tipo: "atualizar", id: "s", campos: { feito: true } });
    const antes = derivar(servidor, [criarA, criarB, editarS], "checklist");

    // Uma tecla a mais no item "b": a fila combina e troca só a operação dele.
    const fila = enfileirar([criarA, criarB, editarS], op({ recurso: "checklist", tipo: "atualizar", id: "b", campos: { texto: "Bo" } }), new Set(), () => false);
    const depois = derivar(servidor, fila, "checklist");

    const porId = (lista: { id: string }[]) => new Map(lista.map((r) => [r.id, r]));
    expect(porId(depois).get("a")).toBe(porId(antes).get("a"));
    expect(porId(depois).get("s")).toBe(porId(antes).get("s"));
    expect(porId(depois).get("b")).not.toBe(porId(antes).get("b"));
    expect(porId(depois).get("b")).toMatchObject({ texto: "Bo" });
  });

  it("base nova vinda do servidor (Realtime) recalcula a versão com a fila por cima", () => {
    const editar = op({ recurso: "checklist", tipo: "atualizar", id: "s", campos: { feito: true } });
    const v1 = derivar(new Map([["s", { id: "s", texto: "v1", feito: false }]]), [editar], "checklist");
    const v2 = derivar(new Map([["s", { id: "s", texto: "v2", feito: false }]]), [editar], "checklist");
    expect(v1[0]).toEqual({ id: "s", texto: "v1", feito: true });
    expect(v2[0]).toEqual({ id: "s", texto: "v2", feito: true });
  });
});
