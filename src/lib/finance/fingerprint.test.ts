import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { reconciliarImportacao, type GastoExistente } from "./duplicados";
import {
  calcularFingerprint,
  entradaDoFingerprint,
  fingerprintsDoLote,
  FORMATO_FINGERPRINT,
  proximoFingerprintLivre,
  type CompraParaFingerprint,
} from "./fingerprint";
import { analisarFatura, compraDaTransacao } from "./invoice-analyzer";

const HOJE = "2026-11-01";
const EU = "11111111-1111-4111-8111-111111111111";
const PAR = "22222222-2222-4222-8222-222222222222";

const compra = (c: Partial<CompraParaFingerprint> = {}): CompraParaFingerprint => ({
  dataIso: "2026-10-05",
  descricaoOriginal: "PG *UBER *TRIP",
  valor: 23.45,
  moeda: "BRL",
  parcela: null,
  ...c,
});

const FATURA_OUTUBRO = [
  "date,title,amount",
  "2026-10-01,PG *UBER *TRIP,23.45",
  "2026-10-01,PG *UBER *TRIP,23.45", // ida e volta: duas corridas iguais
  "2026-10-03,IFD*IFOOD,55.01",
  "2026-09-20,MAGAZINE LUIZA PARC 02/10,120.00",
  "2026-10-08,Pagamento recebido,-1000.00",
].join("\n");

/** Importa o texto e devolve o que a importação gravaria (gastos com fingerprint). */
function importar(texto: string, userId: string): GastoExistente[] {
  const { transacoes } = analisarFatura(texto, HOJE);
  const fps = fingerprintsDoLote(transacoes.map(compraDaTransacao));
  return transacoes.map((t, i) => ({
    data: t.dataIso,
    valor: t.valor,
    moeda: t.moeda,
    tipo: "gasto",
    descricao: t.cleanMerchantName,
    userId,
    pagoPor: userId,
    transactionFingerprint: fps[i],
  }));
}

function linhasDe(texto: string) {
  const { transacoes } = analisarFatura(texto, HOJE);
  const compras = transacoes.map(compraDaTransacao);
  const fps = fingerprintsDoLote(compras);
  return transacoes.map((t, i) => ({
    id: t.id,
    dataIso: t.dataIso,
    valor: t.valor,
    moeda: t.moeda,
    fingerprint: fps[i],
    parcela: compras[i].parcela,
  }));
}

describe("transaction_fingerprint", () => {
  it("é v1 + SHA-256 da entrada canônica documentada", () => {
    const entrada = entradaDoFingerprint(compra({ descricaoOriginal: "  pg *uber   *trip " }), 1);
    expect(entrada).toBe("v1|2026-10-05|PG *UBER *TRIP|2345|BRL|-|#1");
    const fp = calcularFingerprint(compra(), 1);
    expect(fp).toMatch(FORMATO_FINGERPRINT);
    expect(fp).toBe(`v1:${createHash("sha256").update(entrada).digest("hex")}`);
  });

  it("ignora caixa, espaços, forma Unicode e ruído de float; separa o que é outra compra", () => {
    const base = calcularFingerprint(compra(), 1);
    expect(calcularFingerprint(compra({ descricaoOriginal: "Pg *Uber  *Trip" }), 1)).toBe(base);
    expect(calcularFingerprint(compra({ valor: 23.450000001 }), 1)).toBe(base);
    expect(calcularFingerprint(compra({ moeda: "brl" }), 1)).toBe(base);
    const cafe = (d: string) => calcularFingerprint(compra({ descricaoOriginal: d }), 1);
    expect(cafe("CAFE\u0301 DA ESQUINA")).toBe(cafe("CAFÉ DA ESQUINA"));

    for (const outra of [
      compra({ valor: 23.46 }),
      compra({ dataIso: "2026-10-06" }),
      compra({ moeda: "USD" }),
      compra({ descricaoOriginal: "PG *UBER *EATS" }),
      compra({ parcela: { atual: 2, total: 10 } }),
    ]) {
      expect(calcularFingerprint(outra, 1)).not.toBe(base);
    }
    expect(calcularFingerprint(compra(), 2)).not.toBe(base);
  });

  it("parcelas diferentes da mesma compra são lançamentos diferentes", () => {
    const p2 = calcularFingerprint(compra({ parcela: { atual: 2, total: 10 } }), 1);
    const p3 = calcularFingerprint(compra({ parcela: { atual: 3, total: 10 } }), 1);
    expect(p2).not.toBe(p3);
  });

  it("linhas idênticas no mesmo arquivo recebem ocorrências diferentes", () => {
    const fps = fingerprintsDoLote([compra(), compra(), compra({ valor: 10 })]);
    expect(new Set(fps).size).toBe(3);
    expect(fps[0]).toBe(calcularFingerprint(compra(), 1));
    expect(fps[1]).toBe(calcularFingerprint(compra(), 2));
  });
});

describe("faturas reimportadas", () => {
  it("a mesma fatura de novo: todas as compras saem como já importadas", () => {
    const gravados = importar(FATURA_OUTUBRO, EU);
    const r = reconciliarImportacao(linhasDe(FATURA_OUTUBRO), gravados, EU);
    expect(gravados).toHaveLength(4);
    expect([...r.values()].map((m) => m.tipo)).toEqual(["ja_importado", "ja_importado", "ja_importado", "ja_importado"]);
  });

  it("a fatura seguinte traz a próxima parcela (mesma data e valor): ela é nova", () => {
    const gravados = importar(FATURA_OUTUBRO, EU);
    const novembro = ["date,title,amount", "2026-09-20,MAGAZINE LUIZA PARC 03/10,120.00"].join("\n");
    expect(reconciliarImportacao(linhasDe(novembro), gravados, EU).size).toBe(0);

    // Importação antiga, sem fingerprint, mas com a parcela gravada: também não casa.
    const semFingerprint = gravados.map((g) => ({ ...g, transactionFingerprint: null, parcelaAtual: 2, totalParcelas: 10 }));
    expect(reconciliarImportacao(linhasDe(novembro), semFingerprint.slice(3), EU).size).toBe(0);
    // Lançada à mão (sem parcela conhecida): a heurística avisa.
    const manual = { ...semFingerprint[3], parcelaAtual: null, totalParcelas: null };
    expect([...reconciliarImportacao(linhasDe(novembro), [manual], EU).values()][0]?.tipo).toBe("parece_lancado");
  });

  it("duas corridas iguais: se só uma foi importada, a segunda continua nova", () => {
    const umaSo = ["date,title,amount", "2026-10-01,PG *UBER *TRIP,23.45"].join("\n");
    const gravados = importar(umaSo, EU);
    const linhas = linhasDe(FATURA_OUTUBRO);
    const r = reconciliarImportacao(linhas, gravados, EU);
    expect(r.get(linhas[0].id)?.tipo).toBe("ja_importado");
    expect(r.has(linhas[1].id)).toBe(false);
  });

  it("a mesma compra no cartão do par não é duplicata (escopo por pessoa)", () => {
    const doPar = importar(FATURA_OUTUBRO, PAR);
    expect(reconciliarImportacao(linhasDe(FATURA_OUTUBRO), doPar, EU).size).toBe(0);
  });

  it("gasto lançado à mão antes da fatura cai na heurística (data, moeda e centavos)", () => {
    const manual: GastoExistente = {
      data: "2026-10-03",
      valor: 55.01,
      moeda: "BRL",
      tipo: "gasto",
      descricao: "Jantar pelo iFood",
      userId: PAR,
      pagoPor: EU, // o par lançou, mas quem pagou fui eu
    };
    const linhas = linhasDe(FATURA_OUTUBRO);
    const r = reconciliarImportacao(linhas, [manual], EU);
    expect([...r.entries()]).toEqual([[linhas[2].id, { tipo: "parece_lancado", descricao: "Jantar pelo iFood" }]]);
  });

  it("a heurística não usa gasto pago pelo par nem pagamento do acerto", () => {
    const linhas = linhasDe(FATURA_OUTUBRO);
    const base = { data: "2026-10-03", valor: 55.01, moeda: "BRL", descricao: "x", userId: PAR } as const;
    expect(reconciliarImportacao(linhas, [{ ...base, tipo: "gasto", pagoPor: PAR }], EU).size).toBe(0);
    expect(reconciliarImportacao(linhas, [{ ...base, tipo: "acerto", pagoPor: EU }], EU).size).toBe(0);
  });

  it("o gasto que casou pelo fingerprint não é reaproveitado pela heurística", () => {
    const gravados = importar(["date,title,amount", "2026-10-01,PG *UBER *TRIP,23.45"].join("\n"), EU);
    // Mesma data e valor, mas outro estabelecimento: só a 1ª linha é a importada.
    const texto = ["date,title,amount", "2026-10-01,PG *UBER *TRIP,23.45", "2026-10-01,99 TAXI,23.45"].join("\n");
    const linhas = linhasDe(texto);
    const r = reconciliarImportacao(linhas, gravados, EU);
    expect(r.get(linhas[0].id)?.tipo).toBe("ja_importado");
    expect(r.has(linhas[1].id)).toBe(false);
  });

  it("“Importar mesmo assim” recebe a próxima ocorrência livre (o índice único aceita)", () => {
    const gravados = importar(FATURA_OUTUBRO, EU);
    const ocupados = new Set(gravados.map((g) => g.transactionFingerprint!));
    const uber = compra({ dataIso: "2026-10-01" });
    const livre = proximoFingerprintLivre(uber, ocupados);
    expect(ocupados.has(livre)).toBe(false);
    expect(livre).toBe(calcularFingerprint(uber, 3)); // #1 e #2 já gravados
  });
});
