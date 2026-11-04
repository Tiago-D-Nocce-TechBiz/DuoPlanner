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
});
