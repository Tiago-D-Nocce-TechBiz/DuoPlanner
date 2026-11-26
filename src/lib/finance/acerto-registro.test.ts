import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aplicarLote } from "@/lib/sync/aplicar-operacao";
import type { OperacaoBruta } from "@/lib/sync/esquemas";
import { calcularAcerto, type LancamentoAcerto } from "./acerto";
import { contarAcertos, idDoAcerto, txidDoAcerto, type PagamentoDeAcerto } from "./acerto-registro";
import { toCents } from "./money";

/**
 * Registrar o pagamento do acerto é idempotente: "Já paguei" (devedor) e
 * "Recebi" (credor) chegam ao mesmo registro, e o saldo não inverte.
 */

const WS = "33333333-3333-4333-8333-333333333333";
const ANA = "11111111-1111-4111-8111-111111111111"; // dona
const BRUNO = "22222222-2222-4222-8222-222222222222"; // parceiro
const membros = { dono: ANA, parceiro: BRUNO };

const pagamento = (extra: Partial<PagamentoDeAcerto> = {}): PagamentoDeAcerto => ({
  workspaceId: WS,
  devedorId: BRUNO,
  credorId: ANA,
  valorCentavos: 4_000,
  acertosJaRegistrados: 0,
  ...extra,
});

describe("id e txid do acerto", () => {
  it("é um UUID válido para o servidor (z.uuid) e estável", () => {
    const id = idDoAcerto(pagamento());
    expect(z.uuid().safeParse(id).success).toBe(true);
    expect(idDoAcerto(pagamento())).toBe(id);
  });

  it("muda com qualquer parte da identidade: espaço, quem paga, quem recebe, valor e nº de acertos", () => {
    const base = idDoAcerto(pagamento());
    const variacoes: Partial<PagamentoDeAcerto>[] = [
      { workspaceId: "44444444-4444-4444-8444-444444444444" },
      { devedorId: ANA, credorId: BRUNO },
      { valorCentavos: 4_001 },
      { acertosJaRegistrados: 1 },
    ];
    for (const v of variacoes) expect(idDoAcerto(pagamento(v)), JSON.stringify(v)).not.toBe(base);
    expect(new Set(variacoes.map((v) => idDoAcerto(pagamento(v)))).size).toBe(variacoes.length);
  });

  it("txid: 25 caracteres alfanuméricos maiúsculos, estável por acerto e diferente entre acertos", () => {
    const txid = txidDoAcerto(pagamento());
    expect(txid).toMatch(/^DP[0-9A-F]{23}$/);
    expect(txid).toHaveLength(25);
    expect(txidDoAcerto(pagamento())).toBe(txid);
    expect(txidDoAcerto(pagamento({ acertosJaRegistrados: 1 }))).not.toBe(txid);
    expect(txidDoAcerto(pagamento({ valorCentavos: 1 }))).not.toBe(txid);
  });

  it("recusa valor zero, negativo, fracionário e contagem inválida", () => {
    for (const valorCentavos of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) expect(() => idDoAcerto(pagamento({ valorCentavos })), String(valorCentavos)).toThrow(RangeError);
    for (const acertosJaRegistrados of [-1, 0.5, Number.NaN]) expect(() => txidDoAcerto(pagamento({ acertosJaRegistrados }))).toThrow(RangeError);
  });

  it("conta só os pagamentos de acerto compartilhados", () => {
    expect(
      contarAcertos([
        { tipo: "acerto", escopo: "viagem_compartilhado" },
        { tipo: "acerto", escopo: "viagem_compartilhado" },
        { tipo: "gasto", escopo: "viagem_compartilhado" },
        { tipo: "acerto", escopo: "pessoal_privado" },
      ])
    ).toBe(2);
    expect(contarAcertos([])).toBe(0);
  });
});

/* -------------- dois aparelhos contra um banco com chave primária -------------- */

type Linha = Record<string, unknown>;

/** Banco mínimo: tabela `despesas_viagem` com chave primária (id), como o Postgres. */
function bancoComChavePrimaria() {
  const linhas = new Map<string, Linha>();
  const from = () => {
    const filtros: [string, unknown][] = [];
    let acao: "select" | "insert" = "select";
    let entrada: Linha[] = [];
    const q: Record<string, unknown> = {};
    q.insert = (l: Linha | Linha[]) => ((acao = "insert"), (entrada = Array.isArray(l) ? l : [l]), q);
    q.select = () => q;
    q.eq = (k: string, v: unknown) => (filtros.push([k, v]), q);
    q.single = () => q;
    q.maybeSingle = () => q;
    q.then = (ok: (v: unknown) => unknown) => {
      if (acao === "insert") {
        if (entrada.some((l) => linhas.has(String(l.id)))) return ok({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } });
        for (const l of entrada) linhas.set(String(l.id), { ...l, user_id: "x", atualizado_em: "2026-10-20T10:00:00Z" });
        return ok({ data: entrada.map((l) => linhas.get(String(l.id))), error: null });
      }
      const id = filtros.find(([k]) => k === "id")?.[1];
      return ok({ data: id !== undefined ? (linhas.get(String(id)) ?? null) : null, error: null });
    };
    return q;
  };
  return { supabase: { from } as unknown as SupabaseClient, linhas };
}

const criarAcerto = (opId: string, p: PagamentoDeAcerto, valorReais: number): OperacaoBruta => ({
  opId,
  tipo: "criar",
  recurso: "despesas",
  registro: {
    id: idDoAcerto(p),
    descricao: "Acerto via Pix: Bruno → Ana",
    valor: valorReais,
    moeda: "BRL",
    cotacaoBrl: null,
    data: "2026-10-20",
    categoria: "Gasto Pessoal (Fora da Viagem)",
    escopo: "viagem_compartilhado",
    pagoPor: p.devedorId,
    proporcaoDivisao: 0,
    tipo: "acerto",
    origem: "manual",
  },
});

const GASTOS: LancamentoAcerto[] = [
  { pagoPor: ANA, valorBrl: 100, proporcaoDivisao: null, tipo: "gasto" },
  { pagoPor: BRUNO, valorBrl: 20, proporcaoDivisao: null, tipo: "gasto" },
];

describe("os dois lados registram o mesmo acerto", () => {
  it("devedor e credor, cada um no seu aparelho: uma só linha no banco, e as duas operações dão certo", async () => {
    const antes = calcularAcerto(GASTOS, membros, { regra: "igual" });
    expect(antes).toMatchObject({ devedor: "parceiro", credor: "dono", valorAcerto: 40 });
    // O mesmo estado de dados nos dois aparelhos: a mesma identidade.
    const p = pagamento({ valorCentavos: toCents(antes.valorAcerto), acertosJaRegistrados: 0 });
    const { supabase, linhas } = bancoComChavePrimaria();

    const doDevedor = await aplicarLote(supabase, BRUNO, { id: WS }, [criarAcerto("op-devedor", p, antes.valorAcerto)]);
    const doCredor = await aplicarLote(supabase, ANA, { id: WS }, [criarAcerto("op-credor", p, antes.valorAcerto)]);

    expect(linhas.size).toBe(1);
    expect(doDevedor.resultados[0]).toMatchObject({ status: "aplicada" });
    expect(doCredor.resultados[0]).toMatchObject({ status: "aplicada" }); // idempotente, não "rejeitada"
    expect((doCredor.resultados[0] as { registro?: { id: string } }).registro?.id).toBe(idDoAcerto(p));

    // O saldo fecha em zero, e não inverte.
    const gravados = [...linhas.values()].map((l) => ({ pagoPor: String(l.pago_por), valorBrl: Number(l.valor), proporcaoDivisao: 0, tipo: "acerto" as const }));
    const depois = calcularAcerto([...GASTOS, ...gravados], membros, { regra: "igual" });
    expect(depois).toMatchObject({ devedor: null, credor: null, valorAcerto: 0 });
  });

  it("o problema que isto evita: com ids sorteados, os dois registros somam e o saldo inverte", () => {
    const antes = calcularAcerto(GASTOS, membros, { regra: "igual" });
    const pagamentoDe = (): LancamentoAcerto => ({ pagoPor: BRUNO, valorBrl: antes.valorAcerto, proporcaoDivisao: 0, tipo: "acerto" });
    const dobrado = calcularAcerto([...GASTOS, pagamentoDe(), pagamentoDe()], membros, { regra: "igual" });
    expect(dobrado).toMatchObject({ devedor: "dono", credor: "parceiro", valorAcerto: 40 });
  });

  it("clique duplo e reenvio da mesma operação (resposta perdida) não criam outra linha", async () => {
    const p = pagamento();
    const { supabase, linhas } = bancoComChavePrimaria();
    for (let i = 0; i < 3; i++) {
      const r = await aplicarLote(supabase, BRUNO, { id: WS }, [criarAcerto(`op-${i}`, p, 40)]);
      expect(r.resultados[0]).toMatchObject({ status: "aplicada" });
    }
    expect(linhas.size).toBe(1);
  });

  it("um novo acerto, depois de novos gastos, é outro registro: o primeiro não bloqueia o segundo", async () => {
    const { supabase, linhas } = bancoComChavePrimaria();
    await aplicarLote(supabase, BRUNO, { id: WS }, [criarAcerto("a", pagamento({ acertosJaRegistrados: 0 }), 40)]);
    await aplicarLote(supabase, BRUNO, { id: WS }, [criarAcerto("b", pagamento({ acertosJaRegistrados: 1 }), 40)]);
    expect(linhas.size).toBe(2);
    // Mesmo valor, mas depois de um acerto já registrado: a identidade tem o número do acerto.
    expect(idDoAcerto(pagamento({ acertosJaRegistrados: 0 }))).not.toBe(idDoAcerto(pagamento({ acertosJaRegistrados: 1 })));
  });

  it("dados diferentes nos dois aparelhos (sincronização atrasada) dão registros diferentes: o limite está documentado e o saldo mostra a diferença", async () => {
    const { supabase, linhas } = bancoComChavePrimaria();
    await aplicarLote(supabase, BRUNO, { id: WS }, [criarAcerto("a", pagamento({ valorCentavos: 4_000 }), 40)]);
    await aplicarLote(supabase, ANA, { id: WS }, [criarAcerto("b", pagamento({ valorCentavos: 4_500 }), 45)]);
    expect(linhas.size).toBe(2);
  });
});
