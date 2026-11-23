import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { analisarFatura, calcularRaioX, type TransacaoAnalisada } from "./invoice-analyzer";
import { normalizarTexto, soAscii } from "./classificar";
import { lerDataLancamento, parseDataLancamento } from "./importar";
import { fromCents, sumCents, toCents } from "./money";
import { sha256Hex, sha256HexDoTexto } from "./sha256";

/**
 * A Fase 1 do importador (arquivo → tabela na tela) foi enxugada para rodar
 * melhor numa CPU lenta: caminho rápido no arredondamento, Raio-X numa
 * passada, memo das datas, ASCII sem \`normalize\` e SHA-256 com buffer
 * reaproveitado. Nada disso pode mudar um resultado. Cada teste compara o
 * código atual com a implementação anterior (reproduzida aqui como
 * referência) em entradas determinísticas.
 */

function mulberry32(semente: number) {
  let s = semente;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ arredondamento ------------------------------ */

/** A versão anterior de `arredondarInteiro`, com `toPrecision(15)` em todo valor. */
function arredondarComToPrecision(x: number): number {
  if (!Number.isFinite(x)) throw new RangeError(`Valor monetário inválido: ${x}.`);
  const absoluto = Math.round(Number(Math.abs(x).toPrecision(15)));
  if (absoluto > Number.MAX_SAFE_INTEGER) throw new RangeError(`Valor monetário grande demais: ${x}.`);
  const r = x < 0 ? -absoluto : absoluto;
  return r === 0 ? 0 : r;
}

function resultado(fn: () => number): number | string {
  try {
    return fn();
  } catch (e) {
    return (e as Error).message;
  }
}

describe("arredondamento em centavos (caminho rápido)", () => {
  it("dá o MESMO resultado que a versão com toPrecision(15), inclusive sinal de zero e mensagens de erro", { timeout: 30_000 }, () => {
    const rnd = mulberry32(2026);
    const valores: number[] = [];
    for (let i = 0; i < 100_000; i++) valores.push(+(rnd() * 20_000_000).toFixed(Math.floor(rnd() * 5)) * (rnd() < 0.3 ? -1 : 1));
    // Colados em meio centavo (onde toPrecision decide o desempate).
    for (let i = 0; i < 100_000; i++) valores.push((Math.floor(rnd() * 1e9) + 0.5) / 100 + (rnd() - 0.5) * 1e-9);
    for (let i = 0; i < 50_000; i++) valores.push(((Math.floor(rnd() * 1e9) + 0.5) / 100) * (rnd() < 0.5 ? 1 : -1));
    // Perto e acima do limite de 1e9 centavos, onde o caminho rápido deixa de valer.
    for (let i = 0; i < 50_000; i++) valores.push(rnd() * 1e13 * (rnd() < 0.5 ? 1 : -1));
    valores.push(0, -0, 1e-9, -0.004, 0.005, 1.005, 2.675, -1.005, 9_999_999.995, 1e7, 1e9, 1e11, 1e13, 9e13, 1e14, Number.NaN, Infinity, -Infinity, Number.MAX_VALUE);
    // Uma só asserção no fim: `expect` por valor custa segundos em 300 mil amostras.
    const divergencias: string[] = [];
    for (const v of valores) {
      const atual = resultado(() => toCents(v));
      const anterior = resultado(() => arredondarComToPrecision(v * 100));
      if (!Object.is(atual, anterior) && divergencias.length < 5) divergencias.push(`toCents(${v}): atual ${atual}, anterior ${anterior}`);
    }
    expect(valores.length).toBeGreaterThan(300_000);
    expect(divergencias).toEqual([]);
  });

  it("continua exato nos casos clássicos de ponto flutuante", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(2.675)).toBe(268);
    expect(toCents(-1.005)).toBe(-101);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1234.56)).toBe(123456);
    expect(Object.is(toCents(-0.004), 0)).toBe(true);
  });
});

/* --------------------------------- Raio-X --------------------------------- */

const LOJAS = ["PG *UBER *TRIP", "IFD*IFOOD", "PADARIA DO ZÉ", "NETFLIX.COM", "MERCADO LIVRE", "RAIA DROGASIL", "LOJA XYZ PARC 03/12", "AUTO POSTO SAO JORGE", "HOTEL FASANO 2/6", "RESTAURANTE FOGO DE CHÃO"];

function faturaGerada(compras: number, semente: number): string {
  const rnd = mulberry32(semente);
  const linhas = ["Data;Descrição;Valor"];
  for (let i = 0; i < compras; i++) {
    const dia = String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
    const valor = (rnd() * 1500).toFixed(2).replace(".", ",");
    linhas.push(`${dia}/10/2026;${LOJAS[Math.floor(rnd() * LOJAS.length)]};${valor}`);
  }
  return linhas.join("\n");
}

/** O Raio-X anterior: cinco passadas, `toCents` repetido por compra. */
function raioXEmCincoPassadas(transacoes: TransacaoAnalisada[]) {
  const ativas = transacoes.filter((t) => !t.ignorarNoCalculo);
  const aVista = ativas.filter((t) => !t.installmentInfo.isInstallment);
  const parceladas = ativas.filter((t) => t.installmentInfo.isInstallment);
  const totalFatura = sumCents(ativas.map((t) => toCents(t.valor)));
  const totalAVista = sumCents(aVista.map((t) => toCents(t.valor)));
  const totalParceladoMes = sumCents(parceladas.map((t) => toCents(t.valor)));
  const comprometimentoFuturo = sumCents(parceladas.map((t) => toCents(t.installmentInfo.remainingAmount)));
  const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);
  const mapa = new Map<string, { total: number; quantidade: number }>();
  for (const t of ativas) {
    const atual = mapa.get(t.category) ?? { total: 0, quantidade: 0 };
    atual.total += toCents(t.valor);
    atual.quantidade += 1;
    mapa.set(t.category, atual);
  }
  return {
    totalFatura: fromCents(totalFatura),
    totalAVista: fromCents(totalAVista),
    qtdAVista: aVista.length,
    percentualAVista: pct(totalAVista, totalFatura),
    totalParceladoMes: fromCents(totalParceladoMes),
    qtdParcelada: parceladas.length,
    comprometimentoFuturo: fromCents(comprometimentoFuturo),
    porCategoria: [...mapa.entries()]
      .map(([category, { total, quantidade }]) => ({ category, total: fromCents(total), percentual: pct(total, totalFatura), quantidade }))
      .sort((a, b) => b.total - a.total),
  };
}

describe("calcularRaioX numa passada", () => {
  const sem = (r: ReturnType<typeof calcularRaioX>) => ({ ...r, porCategoria: r.porCategoria.map(({ icon, ...resto }) => (typeof icon === "string" ? resto : { icon, ...resto })) });

  it.each([1, 7, 40, 200, 500])("fatura com %i compras: igual ao cálculo em cinco passadas", (n) => {
    const { transacoes } = analisarFatura(faturaGerada(n, n * 31), "2026-11-19");
    expect(transacoes.length).toBeGreaterThan(0);
    expect(sem(calcularRaioX(transacoes))).toEqual(raioXEmCincoPassadas(transacoes));
  });

  it("com compras marcadas para ignorar, sem nenhuma ativa e sem compras", () => {
    const { transacoes } = analisarFatura(faturaGerada(120, 5), "2026-11-19");
    const algumas = transacoes.map((t, i) => ({ ...t, ignorarNoCalculo: i % 3 === 0 }));
    const todas = transacoes.map((t) => ({ ...t, ignorarNoCalculo: true }));
    for (const lista of [algumas, todas, []]) expect(sem(calcularRaioX(lista))).toEqual(raioXEmCincoPassadas(lista));
    expect(calcularRaioX([]).totalFatura).toBe(0);
    expect(calcularRaioX([]).percentualAVista).toBe(0);
  });

  it("fecha ao centavo: o total da fatura é a soma das categorias e das linhas", () => {
    const { transacoes } = analisarFatura(faturaGerada(300, 99), "2026-11-19");
    const r = calcularRaioX(transacoes);
    const somaCategorias = sumCents(r.porCategoria.map((c) => toCents(c.total)));
    expect(somaCategorias).toBe(toCents(r.totalFatura));
    expect(toCents(r.totalAVista) + toCents(r.totalParceladoMes)).toBe(toCents(r.totalFatura));
    expect(r.qtdAVista + r.qtdParcelada).toBe(transacoes.length);
  });
});

/* ---------------------------- datas, ASCII e hash ---------------------------- */

describe("memo de datas", () => {
  const TEXTOS = ["05/10/2026", "5/10/26", "2026-10-05", "2026-10-05T10:30", "05/10", "12.10", "05 out", "5 de outubro de 2025", "31/02/2026", "ontem", "", "  05 / 10 / 2026 ", "05/OUT", "1º set", "30-11-2026 23:59", "x".repeat(80)];

  it("devolve sempre o mesmo que a leitura sem memo, em qualquer ordem e trocando 'hoje'", () => {
    const rnd = mulberry32(11);
    const hojes = ["2026-11-19", "2026-01-02", "2027-03-31"];
    for (let i = 0; i < 6_000; i++) {
      const texto = TEXTOS[Math.floor(rnd() * TEXTOS.length)];
      const hoje = hojes[Math.floor(rnd() * hojes.length)];
      expect(parseDataLancamento(texto, hoje), `${texto} @ ${hoje}`).toBe(lerDataLancamento(texto, hoje));
    }
  });

  it("'hoje' diferente não reaproveita o ano de outro dia (datas sem ano)", () => {
    expect(parseDataLancamento("05/10", "2026-11-19")).toBe("2026-10-05");
    expect(parseDataLancamento("05/10", "2026-03-01")).toBe("2025-10-05");
    expect(parseDataLancamento("05/10", "2026-11-19")).toBe("2026-10-05");
  });

  it("passa do teto de entradas do memo sem errar nenhuma", () => {
    for (let i = 0; i < 2_000; i++) {
      const texto = `${String(1 + (i % 28)).padStart(2, "0")}/${String(1 + (i % 12)).padStart(2, "0")}/${2000 + (i % 90)}`;
      expect(parseDataLancamento(texto, "2026-11-19")).toBe(lerDataLancamento(texto, "2026-11-19"));
    }
  });
});

describe("texto sem acentos: caminho ASCII", () => {
  const referencia = (t: string) =>
    ` ${t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

  it("normalizarTexto igual à versão com normalize em ASCII, acentos, emoji e símbolos", () => {
    const amostras = ["PG *UBER *TRIP", "iFood  Restaurante", "AÇAÍ DA PRAIA", "Café São João ☕", "Ação — “aspas”", "naïve ﬁnal", "a\u0301 combinado", "tab\tnova\nlinha", "", "   ", "1234/56", "ÔNIBUS COMETA 10x", "🇧🇷 Brasil", "x".repeat(500)];
    for (const t of amostras) expect(normalizarTexto(t), JSON.stringify(t)).toBe(referencia(t));
  });

  it("soAscii", () => {
    expect(soAscii("abc 123 \t\n~")).toBe(true);
    expect(soAscii("")).toBe(true);
    expect(soAscii("açaí")).toBe(false);
    expect(soAscii("a\u0301")).toBe(false);
    expect(soAscii("☕")).toBe(false);
  });
});

describe("sha256 com buffer reaproveitado", () => {
  const referencia = async (bytes: Uint8Array) => Buffer.from(await webcrypto.subtle.digest("SHA-256", bytes)).toString("hex");

  it("mensagens longas e curtas intercaladas: nenhum byte de uma sobra na outra", async () => {
    const rnd = mulberry32(3);
    const tamanhos = [0, 1, 55, 56, 63, 64, 65, 119, 120, 5_000, 3, 64 * 1024 - 100, 64 * 1024 + 500, 7, 200_000, 1, 128];
    for (let rodada = 0; rodada < 3; rodada++) {
      for (const n of tamanhos) {
        const bytes = Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));
        expect(sha256Hex(bytes), `${n} bytes`).toBe(await referencia(bytes));
      }
    }
  });

  it("texto pelo caminho direto (encodeInto): acentos, emoji, par substituto solto e tamanhos de borda", async () => {
    const textos = ["", "abc", "Ação ✈ 🇧🇷 — “aspas” 中文", "a\ud800b", "\udfff", "x".repeat(55), "x".repeat(56), "ç".repeat(21_000), "y".repeat(30_000), "curto", "🇧🇷".repeat(100)];
    for (let rodada = 0; rodada < 2; rodada++) {
      for (const t of textos) expect(sha256HexDoTexto(t), JSON.stringify(t.slice(0, 20))).toBe(await referencia(new TextEncoder().encode(t)));
    }
  });
});
