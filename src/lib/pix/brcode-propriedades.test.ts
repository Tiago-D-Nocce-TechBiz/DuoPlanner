import { describe, expect, it } from "vitest";
import { crc16Pix, crcConfere, gerarPixCopiaECola, normalizarChavePix, TIPOS_CHAVE_PIX, type DadosPix, type TipoChavePix } from "./brcode";
import { lerBrCode } from "./ler-brcode";

/**
 * O Pix Copia e Cola do Acerto de Contas do DuoPlanner, provado por ida e
 * volta: o que `gerarPixCopiaECola` produz é lido de volta, campo a campo,
 * por um decodificador estrito independente (TLV, CRC16 e limites do padrão).
 */

const EXEMPLO_BCB =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";

function mulberry32(semente: number) {
  let s = semente;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHAVES: Record<TipoChavePix, string> = {
  cpf: "529.982.247-25",
  cnpj: "11.222.333/0001-81",
  telefone: "(11) 98765-4321",
  email: "Ana.Souza@Exemplo.com.br",
  aleatoria: "123E4567-E12B-12D1-A456-426655440000",
};

function chaveNormalizada(tipo: TipoChavePix): string {
  const r = normalizarChavePix(tipo, CHAVES[tipo]);
  if (!r.ok) throw new Error(r.erro);
  return r.chave;
}

const base = (extra: Partial<DadosPix> = {}): DadosPix => ({ chave: chaveNormalizada("aleatoria"), nomeRecebedor: "Ana Souza", cidade: "Sao Paulo", ...extra });

describe("decodificador estrito", () => {
  it("lê o exemplo oficial do Banco Central", () => {
    expect(lerBrCode(EXEMPLO_BCB)).toEqual({
      ok: true,
      dados: { chave: "123e4567-e12b-12d1-a456-426655440000", nomeRecebedor: "Fulano de Tal", cidade: "BRASILIA", valorCentavos: null, txid: "***", descricao: null },
    });
  });

  it("recusa CRC errado, campo cortado, campo repetido e lixo", () => {
    expect(lerBrCode(EXEMPLO_BCB.slice(0, -1) + "0")).toMatchObject({ ok: false, erro: "CRC inválido" });
    expect(lerBrCode("")).toMatchObject({ ok: false });
    expect(lerBrCode("abc")).toMatchObject({ ok: false });
    expect(lerBrCode(EXEMPLO_BCB.slice(0, 40))).toMatchObject({ ok: false });
    expect(lerBrCode("é" + EXEMPLO_BCB)).toMatchObject({ ok: false, erro: "só ASCII imprimível é permitido" });
    expect(lerBrCode(EXEMPLO_BCB + " ".repeat(600))).toMatchObject({ ok: false });
    // Repetir o campo 59 (com CRC recalculado) precisa ser recusado.
    const repetido = EXEMPLO_BCB.slice(0, -8) + "5913Fulano de Tal" .padStart(0) + "6304";
    expect(lerBrCode(repetido + crc16Pix(repetido))).toMatchObject({ ok: false });
  });

  it("recusa valor sem 2 casas ou zerado, nome longo demais e moeda diferente de BRL", () => {
    const refazer = (de: string, para: string) => {
      const sem = EXEMPLO_BCB.slice(0, -4).replace(de, para);
      return sem + crc16Pix(sem);
    };
    expect(lerBrCode(refazer("5303986", "5303840"))).toMatchObject({ ok: false, erro: "a moeda precisa ser BRL (986)" });
    expect(lerBrCode(refazer("5913Fulano de Tal", "5926Fulano de Tal e Sobrenomes"))).toMatchObject({ ok: false });
    expect(lerBrCode(refazer("5802BR", "54040.005802BR"))).toMatchObject({ ok: false, erro: "valor precisa ser maior que zero" });
    expect(lerBrCode(refazer("5802BR", "54030.55802BR"))).toMatchObject({ ok: false, erro: "valor precisa ter o formato 0.00" });
    expect(lerBrCode(refazer("5802BR", "540510.505802BR"))).toMatchObject({ ok: true, dados: { valorCentavos: 1050 } });
  });
});

describe("ida e volta: gerar → ler", () => {
  it.each(TIPOS_CHAVE_PIX)("chave %s, com e sem valor", (tipo) => {
    const chave = chaveNormalizada(tipo);
    const sem = lerBrCode(gerarPixCopiaECola(base({ chave })));
    expect(sem).toMatchObject({ ok: true, dados: { chave, nomeRecebedor: "Ana Souza", cidade: "Sao Paulo", valorCentavos: null, txid: "***" } });
    const com = lerBrCode(gerarPixCopiaECola(base({ chave, valor: 42.5, txid: "DUOPLANNER2026", descricao: "Acerto da viagem" })));
    expect(com).toMatchObject({ ok: true, dados: { chave, valorCentavos: 4250, txid: "DUOPLANNER2026", descricao: "Acerto da viagem" } });
  });

  it("valores de R$ 0,01 até o máximo do padrão, sempre com 2 casas e CRC válido", () => {
    const casos: [number, number][] = [
      [0.01, 1],
      [0.1, 10],
      [1, 100],
      [9.99, 999],
      // Meio centavo arredonda para cima, como o resto do app. Em ponto flutuante, `toFixed(2)`
      // erra estes (1.005 → "1.00", 2.675 → "2.67"): é o que este teste existe para barrar.
      [1.005, 101],
      [2.675, 268],
      [8.575, 858],
      [1.255, 126],
      [10.005, 1001],
      [1234.56, 123_456],
      [100_000, 10_000_000],
      [9_999_999_999.99, 999_999_999_999],
    ];
    for (const [reais, centavos] of casos) {
      const pix = gerarPixCopiaECola(base({ valor: reais }));
      expect(crcConfere(pix), String(reais)).toBe(true);
      expect(lerBrCode(pix), String(reais)).toMatchObject({ ok: true, dados: { valorCentavos: centavos } });
    }
  });

  it("recusa valor zero, negativo, abaixo de meio centavo, NaN, infinito e acima do máximo", () => {
    for (const valor of [0, -1, 0.004, Number.NaN, Infinity, 10_000_000_000]) {
      expect(() => gerarPixCopiaECola(base({ valor })), String(valor)).toThrow("Valor do Pix inválido.");
    }
  });

  it("valores aleatórios em centavos: o que entra é o que sai, sem erro de ponto flutuante", () => {
    const rnd = mulberry32(17);
    for (let i = 0; i < 5_000; i++) {
      const centavos = 1 + Math.floor(rnd() * 99_999_999);
      const lido = lerBrCode(gerarPixCopiaECola(base({ valor: centavos / 100 })));
      expect(lido, String(centavos)).toMatchObject({ ok: true, dados: { valorCentavos: centavos } });
    }
  });
});

describe("limites do padrão", () => {
  it("chave de 77 caracteres cabe exatamente no campo 26 (99)", () => {
    const chave = "a".repeat(77 - "@exemplo.com".length) + "@exemplo.com";
    expect(chave).toHaveLength(77);
    const pix = gerarPixCopiaECola(base({ chave, descricao: "não cabe" }));
    expect(lerBrCode(pix)).toMatchObject({ ok: true, dados: { chave, descricao: null } });
  });

  it("chave de 78 caracteres é recusada", () => {
    expect(() => gerarPixCopiaECola(base({ chave: "a".repeat(78) }))).toThrow("Chave Pix inválida.");
    expect(() => gerarPixCopiaECola(base({ chave: "" }))).toThrow("Chave Pix inválida.");
  });

  it("nome com 25 e cidade com 15 caracteres passam inteiros; acima disso são cortados", () => {
    const exato = lerBrCode(gerarPixCopiaECola(base({ nomeRecebedor: "A".repeat(25), cidade: "B".repeat(15) })));
    expect(exato).toMatchObject({ ok: true, dados: { nomeRecebedor: "A".repeat(25), cidade: "B".repeat(15) } });
    const longo = lerBrCode(gerarPixCopiaECola(base({ nomeRecebedor: "A".repeat(40), cidade: "B".repeat(40) })));
    expect(longo).toMatchObject({ ok: true, dados: { nomeRecebedor: "A".repeat(25), cidade: "B".repeat(15) } });
  });

  it("acentos, emoji e símbolos viram ASCII; nome só de símbolos é recusado", () => {
    const r = lerBrCode(gerarPixCopiaECola(base({ nomeRecebedor: "José Ações ☕ & Cia", cidade: "São João del-Rei" })));
    expect(r).toMatchObject({ ok: true, dados: { nomeRecebedor: "Jose Acoes Cia", cidade: "Sao Joao del-Re" } });
    expect(() => gerarPixCopiaECola(base({ nomeRecebedor: "☕☕☕" }))).toThrow("Informe o nome de quem recebe.");
    expect(() => gerarPixCopiaECola(base({ cidade: "🏖️" }))).toThrow("Informe a cidade de quem recebe.");
  });

  it("txid vira alfanumérico com até 25 caracteres; vazio ou só símbolos vira ***", () => {
    expect(lerBrCode(gerarPixCopiaECola(base({ txid: "Duo-Planner_#2026 acerto!" })))).toMatchObject({ ok: true, dados: { txid: "DuoPlanner2026acerto" } });
    expect(lerBrCode(gerarPixCopiaECola(base({ txid: "X".repeat(40) })))).toMatchObject({ ok: true, dados: { txid: "X".repeat(25) } });
    expect(lerBrCode(gerarPixCopiaECola(base({ txid: "---" })))).toMatchObject({ ok: true, dados: { txid: "***" } });
  });
});

describe("CRC16", () => {
  it("trocar qualquer caractere do código invalida o CRC", () => {
    const pix = gerarPixCopiaECola(base({ valor: 120.34, txid: "DUOPLANNER1" }));
    expect(crcConfere(pix)).toBe(true);
    for (let i = 0; i < pix.length; i++) {
      const trocado = pix.slice(0, i) + (pix[i] === "7" ? "8" : "7") + pix.slice(i + 1);
      expect(crcConfere(trocado), `posição ${i}`).toBe(false);
    }
  });

  it("o CRC é sempre 4 dígitos hexadecimais maiúsculos, inclusive com zeros à esquerda", () => {
    const rnd = mulberry32(3);
    let comZero = 0;
    for (let i = 0; i < 4_000; i++) {
      const pix = gerarPixCopiaECola(base({ valor: (1 + Math.floor(rnd() * 1_000_000)) / 100, txid: `T${i}` }));
      const crc = pix.slice(-4);
      expect(crc).toMatch(/^[0-9A-F]{4}$/);
      if (crc.startsWith("0")) comZero++;
      expect(lerBrCode(pix).ok).toBe(true);
    }
    expect(comZero).toBeGreaterThan(0);
  });
});

describe("chaves Pix: normalização e dígitos verificadores", () => {
  it("aceita as chaves bem formadas de cada tipo e produz o formato do DICT", () => {
    expect(chaveNormalizada("cpf")).toBe("52998224725");
    expect(chaveNormalizada("cnpj")).toBe("11222333000181");
    expect(chaveNormalizada("telefone")).toBe("+5511987654321");
    expect(chaveNormalizada("email")).toBe("ana.souza@exemplo.com.br");
    expect(chaveNormalizada("aleatoria")).toBe("123e4567-e12b-12d1-a456-426655440000");
  });

  it("CPF: só passa com os dois dígitos verificadores certos (varredura do último dígito)", () => {
    const ok = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => normalizarChavePix("cpf", `5299822472${d}`).ok);
    expect(ok).toEqual([5]);
  });

  it("CNPJ: só passa com os dígitos verificadores certos; sequências repetidas são recusadas", () => {
    const ok = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => normalizarChavePix("cnpj", `1122233300018${d}`).ok);
    expect(ok).toEqual([1]);
    expect(normalizarChavePix("cnpj", "00.000.000/0000-00").ok).toBe(false);
    expect(normalizarChavePix("cpf", "000.000.000-00").ok).toBe(false);
  });

  it("celular precisa de DDD e 9 dígitos; fixo e DDD zero são recusados; +55 é aceito", () => {
    expect(normalizarChavePix("telefone", "+55 (21) 99876-5432")).toEqual({ ok: true, chave: "+5521998765432" });
    for (const ruim of ["(11) 3456-7890", "(01) 98765-4321", "98765-4321", "11 8765-4321"]) expect(normalizarChavePix("telefone", ruim).ok, ruim).toBe(false);
  });
});
