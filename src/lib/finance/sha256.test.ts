import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexDoTexto } from "./sha256";

/** Referência: o SHA-256 do Web Crypto (o mesmo que o navegador usava antes). */
async function referencia(bytes: Uint8Array): Promise<string> {
  const resumo = await webcrypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(resumo).toString("hex");
}

describe("sha256 (JavaScript puro)", () => {
  it("vetores oficiais (FIPS 180-4 / NIST)", () => {
    expect(sha256HexDoTexto("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256HexDoTexto("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256HexDoTexto("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
    expect(sha256HexDoTexto("a".repeat(1_000_000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
  });

  it("igual ao Web Crypto em todos os tamanhos ao redor dos limites de bloco (0 a 300 bytes)", async () => {
    for (let n = 0; n <= 300; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 131 + n * 7) & 0xff);
      expect(sha256Hex(bytes), `${n} bytes`).toBe(await referencia(bytes));
    }
  });

  it("igual ao Web Crypto em texto com acentos, emoji e caracteres de fatura", async () => {
    const textos = [
      "v1|2026-10-05|PG *UBER *TRIP|2345|BRL|-|#1",
      "v1|2026-10-05|CAFÉ SÃO JOÃO AÇAÍ|1290|BRL|3/10|#2",
      "v1|2026-10-07|LOJA XYZ PARC 03/12|123456|BRL|3/12|#1",
      "Ação ✈️ 🇧🇷 — “aspas” e 中文",
      "x".repeat(55),
      "x".repeat(56),
      "x".repeat(64),
    ];
    for (const t of textos) expect(sha256HexDoTexto(t), t).toBe(await referencia(new TextEncoder().encode(t)));
  });
});
