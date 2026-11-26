import { describe, expect, it } from "vitest";
import { calcularAcerto, normalizarPercentual, percentualDono, descreverRegra, type LancamentoAcerto, type RegraDivisao } from "./acerto";
import { toCents } from "./money";

/**
 * Invariantes do Acerto de Contas do DuoPlanner: não importa o percentual, o
 * total nem a regra, a soma das partes bate com o total ao centavo (sem sobrar
 * nem faltar R$ 0,01) e o saldo dos dois fecha em zero.
 *
 * As partes esperadas vêm de uma referência independente em BigInt (divisão
 * exata e centavo que sobra para a maior fração), escrita aqui de propósito
 * sem reaproveitar `splitAmount`.
 */

const membros = { dono: "ana", parceiro: "bruno" };

function mulberry32(semente: number) {
  let s = semente;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parte do primeiro de dois (percentual em centésimos de ponto: 3333 = 33,33%). */
function parteDoPrimeiro(totalCentavos: number, centesimos: number): number {
  const total = BigInt(totalCentavos);
  const peso = BigInt(centesimos);
  const base = BigInt(10_000);
  const piso = (total * peso) / base;
  const resto = (total * peso) % base; // fração do primeiro, em décimos de milésimo de centavo
  const restoDoOutro = (total * (base - peso)) % base;
  const sobra = total - piso - (total * (base - peso)) / base; // 0 ou 1 centavo
  if (sobra === BigInt(0)) return Number(piso);
  // O centavo vai para a maior fração; empate, para o primeiro.
  return Number(resto >= restoDoOutro ? piso + BigInt(1) : piso);
}

const lancamento = (pagoPor: string, centavos: number, proporcao: number | null = null): LancamentoAcerto => ({
  pagoPor,
  valorBrl: centavos / 100,
  proporcaoDivisao: proporcao,
  tipo: "gasto",
});

const c = (reais: number) => toCents(reais);

describe("normalizarPercentual", () => {
  it("limita a 0–100, usa 2 casas e trata valor inválido como 0", () => {
    expect(normalizarPercentual(33.335)).toBe(33.34);
    expect(normalizarPercentual(33.3333)).toBe(33.33);
    expect(normalizarPercentual(-5)).toBe(0);
    expect(normalizarPercentual(120)).toBe(100);
    expect(normalizarPercentual(Number.NaN)).toBe(0);
    expect(normalizarPercentual(Infinity)).toBe(0);
    expect(normalizarPercentual(60)).toBe(60);
    expect(normalizarPercentual(100 - 33.33)).toBe(66.67);
  });

  it("descrição e percentual exibido usam o mesmo valor do banco", () => {
    expect(percentualDono({ regra: "proporcional", percentualDono: 33.335 })).toBe(33.34);
    expect(descreverRegra({ regra: "proporcional", percentualDono: 33.335 }, { dono: "Ana", parceiro: "Bruno" })).toBe("Ana 33,3% · Bruno 66,7%");
    expect(descreverRegra({ regra: "proporcional", percentualDono: 60 }, { dono: "Ana", parceiro: "Bruno" })).toBe("Ana 60% · Bruno 40%");
  });
});

describe("regra proporcional: a soma das partes é sempre o total", () => {
  it("varre todos os percentuais de 0,00 a 100,00 (a cada 0,01) com totais difíceis, contra a referência em BigInt", () => {
    const totais = [1, 2, 3, 7, 99, 100, 101, 1_001, 33_333, 100_001, 999_999, 12_345_678];
    for (let centesimos = 0; centesimos <= 10_000; centesimos += 1) {
      for (const total of totais) {
        const r = calcularAcerto([lancamento("ana", total)], membros, { regra: "proporcional", percentualDono: centesimos / 100 });
        const parteDono = toCents(r.parte.dono);
        const parteParceiro = toCents(r.parte.parceiro);
        if (parteDono + parteParceiro !== total || parteDono !== parteDoPrimeiro(total, centesimos)) {
          expect.fail(`total ${total}, ${centesimos / 100}%: dono ${parteDono}, parceiro ${parteParceiro}, esperado dono ${parteDoPrimeiro(total, centesimos)}`);
        }
      }
    }
  });

  it("totais aleatórios (até R$ 10 milhões), vários pagadores: totais, partes e saldos fecham ao centavo", () => {
    const rnd = mulberry32(2026);
    for (let rodada = 0; rodada < 4_000; rodada++) {
      const n = 1 + Math.floor(rnd() * 12);
      const lancs: LancamentoAcerto[] = [];
      let somaGastos = 0;
      for (let i = 0; i < n; i++) {
        const centavos = 1 + Math.floor(rnd() * 1_000_000_00);
        const quem = rnd() < 0.5 ? "ana" : "bruno";
        const propria = rnd() < 0.3 ? Math.round(rnd() * 10_000) / 100 : null;
        lancs.push(lancamento(quem, centavos, propria));
        somaGastos += centavos;
      }
      const regras: RegraDivisao[] = [
        { regra: "igual" },
        { regra: "proporcional", percentualDono: Math.round(rnd() * 10_000) / 100 },
        { regra: "fixo", valorFixo: Math.round(rnd() * 5_000_000) / 100, quemCobre: rnd() < 0.5 ? "dono" : "parceiro" },
      ];
      for (const regra of regras) {
        const r = calcularAcerto(lancs, membros, regra);
        const pago = toCents(r.pago.dono) + toCents(r.pago.parceiro);
        const parte = toCents(r.parte.dono) + toCents(r.parte.parceiro);
        const saldo = toCents(r.saldo.dono) + toCents(r.saldo.parceiro);
        expect(toCents(r.totalGastos), JSON.stringify(regra)).toBe(somaGastos);
        expect(pago, `pago ${JSON.stringify(regra)}`).toBe(somaGastos);
        expect(parte, `parte ${JSON.stringify(regra)}`).toBe(somaGastos);
        expect(saldo, `saldo ${JSON.stringify(regra)}`).toBe(0);
        // Quem deve transfere exatamente o que o outro tem a receber.
        if (r.devedor && r.credor) expect(toCents(r.valorAcerto)).toBe(toCents(r.saldo[r.credor]));
        else expect(r.valorAcerto).toBe(0);
        expect(r.valorAcerto).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("desempate do centavo: quem tem a maior fração; empate vai ao dono (regra) ou a quem pagou (divisão própria)", () => {
    // R$ 0,01 a 50%: empate de frações, vai para o dono.
    expect(calcularAcerto([lancamento("bruno", 1)], membros, { regra: "igual" }).parte).toEqual({ dono: 0.01, parceiro: 0 });
    // R$ 0,01 a 40% do dono: a fração do parceiro (60%) é maior, o centavo vai para ele.
    expect(calcularAcerto([lancamento("ana", 1)], membros, { regra: "proporcional", percentualDono: 40 }).parte).toEqual({ dono: 0, parceiro: 0.01 });
    // R$ 0,01 de divisão própria 50% pago pelo parceiro: empate, vai para quem pagou.
    expect(calcularAcerto([lancamento("bruno", 1, 50)], membros, { regra: "igual" }).parte).toEqual({ dono: 0, parceiro: 0.01 });
    // R$ 10,01 ÷ 2: R$ 5,01 e R$ 5,00.
    expect(calcularAcerto([lancamento("ana", 1001)], membros, { regra: "igual" }).parte).toEqual({ dono: 5.01, parceiro: 5 });
  });

  it("percentual com mais de 2 casas é tratado como o banco o guardaria (sem divergir da tela)", () => {
    const a = calcularAcerto([lancamento("ana", 100_00)], membros, { regra: "proporcional", percentualDono: 33.335 });
    const b = calcularAcerto([lancamento("ana", 100_00)], membros, { regra: "proporcional", percentualDono: 33.34 });
    expect(a).toEqual(b);
    expect(a.parte.dono).toBe(33.34);
    expect(a.parte.parceiro).toBe(66.66);
  });

  it("0% e 100% entregam tudo a uma só pessoa", () => {
    expect(calcularAcerto([lancamento("ana", 12_345)], membros, { regra: "proporcional", percentualDono: 0 }).parte).toEqual({ dono: 0, parceiro: 123.45 });
    expect(calcularAcerto([lancamento("ana", 12_345)], membros, { regra: "proporcional", percentualDono: 100 }).parte).toEqual({ dono: 123.45, parceiro: 0 });
  });
});

describe("regra fixa e divisão própria", () => {
  it("valor fixo nunca passa do total e o resto vai ao outro, sem sobra", () => {
    for (const total of [1, 99, 100, 5_000, 123_456]) {
      for (const fixoCentavos of [0, 1, 50, 5_000, 1_000_000]) {
        for (const quemCobre of ["dono", "parceiro"] as const) {
          const r = calcularAcerto([lancamento("ana", total)], membros, { regra: "fixo", valorFixo: fixoCentavos / 100, quemCobre });
          const esperadoDoQueCobre = Math.min(fixoCentavos, total);
          expect(toCents(r.parte[quemCobre])).toBe(esperadoDoQueCobre);
          expect(toCents(r.parte.dono) + toCents(r.parte.parceiro)).toBe(total);
        }
      }
    }
  });

  it("gasto com divisão própria fecha ao centavo e vence a regra do casal", () => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 3_000; i++) {
      const total = 1 + Math.floor(rnd() * 5_000_00);
      const propria = Math.round(rnd() * 10_000) / 100;
      const quem = rnd() < 0.5 ? "ana" : "bruno";
      const r = calcularAcerto([lancamento(quem, total, propria)], membros, { regra: "proporcional", percentualDono: 90 });
      const pagador = quem === "ana" ? "dono" : "parceiro";
      expect(toCents(r.parte.dono) + toCents(r.parte.parceiro)).toBe(total);
      expect(toCents(r.parte[pagador])).toBe(parteDoPrimeiro(total, Math.round(propria * 100)));
    }
  });
});

describe("pagamento do acerto e saldo", () => {
  it("pagar o saldo exato zera as contas; pagar a mais inverte o saldo (por isso o registro precisa ser único)", () => {
    const base = [lancamento("ana", 100_00), lancamento("bruno", 20_01)];
    const antes = calcularAcerto(base, membros, { regra: "igual" });
    expect(antes).toMatchObject({ devedor: "parceiro", credor: "dono" });
    const quitado = (vezes: number): LancamentoAcerto[] => [
      ...base,
      ...Array.from({ length: vezes }, () => ({ pagoPor: "bruno", valorBrl: antes.valorAcerto, proporcaoDivisao: 0, tipo: "acerto" as const })),
    ];
    const uma = calcularAcerto(quitado(1), membros, { regra: "igual" });
    expect(uma).toMatchObject({ devedor: null, credor: null, valorAcerto: 0 });
    // Dois registros do mesmo pagamento: o credor passa a dever o valor pago a mais.
    const duas = calcularAcerto(quitado(2), membros, { regra: "igual" });
    expect(duas).toMatchObject({ devedor: "dono", credor: "parceiro", valorAcerto: antes.valorAcerto });
  });

  it("o acerto nunca conta como gasto do casal", () => {
    const r = calcularAcerto([lancamento("ana", 100_00), { pagoPor: "bruno", valorBrl: 50, proporcaoDivisao: 0, tipo: "acerto" }], membros, { regra: "igual" });
    expect(r.totalGastos).toBe(100);
    expect(c(r.pago.dono) + c(r.pago.parceiro)).toBe(c(150));
  });
});
