import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cifrarNumero,
  decifrarNumero,
  finalDoNumero,
  lerChaveCifra,
  mascararNumero,
} from "./cripto-documentos-nucleo";

const chave = randomBytes(32);
const contexto = { documentoId: "doc-1", userId: "ana" };

describe("cifra dos números de documentos (AES-256-GCM)", () => {
  it("cifra e decifra com a mesma chave e o mesmo contexto", () => {
    const cifrado = cifrarNumero("FX123456", chave, contexto);
    expect(cifrado).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(cifrado).not.toContain("FX123456");
    expect(decifrarNumero(cifrado, chave, contexto)).toBe("FX123456");
  });

  it("IV aleatório: o mesmo número gera textos diferentes", () => {
    expect(cifrarNumero("123", chave, contexto)).not.toBe(cifrarNumero("123", chave, contexto));
  });

  it("não decifra com outra chave, em outra linha ou de outro dono (AAD)", () => {
    const cifrado = cifrarNumero("AB987654", chave, contexto);
    expect(decifrarNumero(cifrado, randomBytes(32), contexto)).toBeNull();
    expect(decifrarNumero(cifrado, chave, { ...contexto, documentoId: "doc-2" })).toBeNull();
    expect(decifrarNumero(cifrado, chave, { ...contexto, userId: "bruno" })).toBeNull();
  });

  it("detecta adulteração e formato inválido", () => {
    const [v, iv, tag, texto] = cifrarNumero("AB987654", chave, contexto).split(":");
    const adulterado = [v, iv, tag, texto.slice(0, -2) + (texto.endsWith("A") ? "BB" : "AA")].join(":");
    expect(decifrarNumero(adulterado, chave, contexto)).toBeNull();
    expect(decifrarNumero("texto-puro", chave, contexto)).toBeNull();
  });

  it("só aceita chave de 32 bytes em base64", () => {
    expect(lerChaveCifra(chave.toString("base64"))).toHaveLength(32);
    expect(lerChaveCifra(randomBytes(16).toString("base64"))).toBeNull();
    expect(lerChaveCifra(undefined)).toBeNull();
  });
});

describe("máscara", () => {
  it("guarda só os 4 últimos caracteres alfanuméricos", () => {
    expect(finalDoNumero("12.345.678-9")).toBe("6789");
    expect(finalDoNumero("fx 123-456")).toBe("3456");
    expect(finalDoNumero("--")).toBeNull();
    expect(mascararNumero("6789")).toBe("•••• 6789");
  });
});
