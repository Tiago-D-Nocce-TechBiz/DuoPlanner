import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Higiene do repositório do DuoPlanner: artefatos de teste e dependências de
 * ferramentas locais nunca entram no Git (o `.tmp-e2e/` já entrou por engano
 * uma vez, com `node_modules`).
 */
const RAIZ = process.cwd();
const git = (...args: string[]) => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" });

describe(".gitignore", () => {
  const regras = readFileSync(path.join(RAIZ, ".gitignore"), "utf8").split(/\r?\n/);

  it("ignora .tmp-e2e/, qualquer .tmp-*/ e node_modules em qualquer nível", () => {
    expect(regras).toContain(".tmp-e2e/");
    expect(regras).toContain(".tmp-*/");
    expect(regras).toContain("node_modules/");
  });

  it.each([
    ".tmp-e2e/qualquer/coisa.ts",
    ".tmp-e2e/node_modules/pacote/index.js",
    ".tmp-analise/medida.json",
    "tests/e2e/.tmp-x/arquivo.ts",
    "ferramenta/node_modules/pacote/index.js",
    ".env.local",
    "test-results/log.txt",
  ])("o Git ignora %s", (caminho) => {
    expect(git("check-ignore", "--no-index", caminho).trim()).toBe(caminho);
  });

  it("nada disso está rastreado", () => {
    const rastreados = git("ls-files").split("\n");
    const intrusos = rastreados.filter((f) => /(^|\/)(\.tmp-[^/]*|node_modules)\//.test(f) || /(^|\/)\.env(\.|$)/.test(f) && f !== ".env.example");
    expect(intrusos).toEqual([]);
  });
});
