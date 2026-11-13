import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile, optimize } from "@tailwindcss/node";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * O `globals.css` como sai do build: compilado pelo Tailwind v4 e passado no
 * mesmo otimizador (Lightning CSS) que o `next build` usa.
 *
 * Com `backdrop-filter` declarado antes de `-webkit-backdrop-filter`, o
 * otimizador mantinha só a versão com prefixo, que o Chrome, o Edge e o
 * Firefox ignoram: o vidro fosco só existia no Safari.
 */
let css = "";

beforeAll(async () => {
  const base = fileURLToPath(new URL(".", import.meta.url));
  const fonte = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
  const compilador = await compile(fonte, { base, onDependency: () => {} });
  css = optimize(compilador.build([]), { minify: true }).code;
});

/** Corpos das regras `seletor{...}`: no celular (fora de @media) e a partir do md (768 px). */
function regras(seletor: string) {
  const exato = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regra = new RegExp(`(?:^|[}])${exato}\\{([^}]*)\\}`, "g");
  const blocosMd = [...css.matchAll(/@media \(min-width:768px\)\{((?:[^{}]*\{[^}]*\})*)\}/g)].map((m) => m[1]);
  const semMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*\}/g, "}");
  return {
    celular: [...semMedia.matchAll(regra)].map((m) => m[1]).join(";"),
    md: blocosMd.flatMap((bloco) => [...`}${bloco}`.matchAll(regra)].map((m) => m[1])).join(";"),
  };
}

/** Opacidade de `background-color` em #rrggbbaa (formato do otimizador); sem alfa = 1. */
function opacidade(corpo: string): number {
  const cor = corpo.match(/background-color:#([0-9a-f]{6})([0-9a-f]{2})?/i);
  if (!cor) throw new Error(`sem background-color em hexadecimal: ${corpo}`);
  return cor[2] ? parseInt(cor[2], 16) / 255 : 1;
}

describe("vidro fosco (.glass-panel) no CSS do build", () => {
  it("a partir do md (768 px): as duas formas do backdrop-filter sobrevivem ao otimizador", () => {
    const { md } = regras(".glass-panel");
    expect(md).toMatch(/(?:^|;)-webkit-backdrop-filter:blur\(24px\)/);
    expect(md).toMatch(/(?:^|;)backdrop-filter:blur\(24px\)/);
  });

  it("no celular: fundo sólido, sem desfoque", () => {
    const { celular } = regras(".glass-panel");
    expect(celular).toMatch(/background-color:var\(--color-card\)/);
    expect(celular).not.toMatch(/backdrop-filter/);
  });

  it("cabeçalho e menu: quase opacos no celular (sem o desfoque por trás) e translúcidos no computador", () => {
    const { celular, md } = regras(".chrome-surface");
    expect(opacidade(celular)).toBeGreaterThanOrEqual(0.95);
    expect(opacidade(md)).toBeLessThan(0.9);
  });
});
