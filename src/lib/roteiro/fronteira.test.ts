import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fronteira cliente/servidor do Roteiro com planilha, conferida no código:
 *
 *  - a página do Roteiro (carregamento inicial) alcança, por imports
 *    estáticos, só React e Next: nada de xlsx, zod, LangChain nem do que é
 *    do servidor;
 *  - o diálogo de importação só é alcançado por `import()` dinâmico;
 *  - o `xlsx` só é importado, dinamicamente, em dois módulos;
 *  - zod e prompts da curadoria ficam só no servidor.
 *
 * O build confirma o resultado nos pacotes (ver o relatório de medição); este
 * teste barra a regressão no código antes do build.
 */

const RAIZ = process.cwd();
const SRC = path.join(RAIZ, "src");

function resolver(de: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(de), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile() && /\.tsx?$/.test(c)) return c;
  }
  return null;
}

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Especificadores de imports ESTÁTICOS (sem `import type`, sem `import()`). */
function estaticos(codigo: string): string[] {
  const sem = semComentarios(codigo);
  const saida: string[] = [];
  for (const m of sem.matchAll(/^\s*(?:import|export)\s+(type\s+)?[\s\S]*?\s*from\s*["']([^"']+)["']/gm)) if (!m[1]) saida.push(m[2]);
  for (const m of sem.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) saida.push(m[1]);
  return saida;
}

function dinamicos(codigo: string): string[] {
  return [...semComentarios(codigo).matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
}

interface Alcance {
  arquivos: Set<string>;
  externos: Set<string>;
}

function alcance(entrada: string): Alcance {
  const arquivos = new Set<string>();
  const externos = new Set<string>();
  const visitar = (f: string) => {
    if (arquivos.has(f)) return;
    arquivos.add(f);
    for (const spec of estaticos(readFileSync(f, "utf8"))) {
      const r = resolver(f, spec);
      if (r) visitar(r);
      else if (!spec.startsWith(".") && !spec.startsWith("@/")) externos.add(spec);
    }
  };
  visitar(path.join(RAIZ, entrada));
  return { arquivos, externos };
}

const relativos = (a: Alcance) => [...a.arquivos].map((f) => path.relative(RAIZ, f).replaceAll("\\", "/"));
const PROIBIDOS = [/^xlsx$/, /^zod$/, /^@langchain\//, /^server-only$/];

function* todosOsArquivos(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) yield* todosOsArquivos(p);
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) yield p;
  }
}

describe("carregamento inicial da página do Roteiro", () => {
  const inicial = alcance("src/app/dashboard/roteiro/page.tsx");

  it("a página é um Server Component (sem 'use client') com ilhas cliente", () => {
    const pagina = readFileSync(path.join(RAIZ, "src/app/dashboard/roteiro/page.tsx"), "utf8");
    expect(pagina).not.toMatch(/^\s*["']use client["']/m);
    expect(relativos(inicial)).toEqual(
      expect.arrayContaining(["src/components/roteiro/acoes-do-roteiro.tsx", "src/components/roteiro/lista-do-roteiro.tsx"])
    );
  });

  it("não alcança xlsx, zod, LangChain nem server-only por imports estáticos", () => {
    for (const ext of inicial.externos) {
      for (const proibido of PROIBIDOS) expect(ext, `import estático de ${ext}`).not.toMatch(proibido);
    }
  });

  it("não alcança a planilha, o leitor de arquivo, a curadoria nem o diálogo de importação", () => {
    const alcancados = relativos(inicial);
    for (const f of [
      "src/components/roteiro/importar-planilha.tsx",
      "src/components/roteiro/previa-importacao.tsx",
      "src/lib/roteiro/ler-arquivo.ts",
      "src/lib/roteiro/template-generator.ts",
      "src/lib/roteiro/planilha.ts",
      "src/lib/roteiro/organizar.ts",
      "src/lib/roteiro/curadoria-cliente.ts",
      "src/lib/roteiro/fingerprint-roteiro.ts",
      "src/lib/finance/sha256.ts",
      "src/lib/ai/roteiro-curadoria.ts",
      "src/app/dashboard/roteiro-import-actions.ts",
    ]) {
      expect(alcancados, f).not.toContain(f);
    }
  });

  it("o diálogo e o modelo da planilha são carregados por import() dinâmico", () => {
    const ilha = readFileSync(path.join(RAIZ, "src/components/roteiro/acoes-do-roteiro.tsx"), "utf8");
    expect(dinamicos(ilha)).toEqual(expect.arrayContaining(["./importar-planilha", "@/lib/roteiro/template-generator"]));
  });
});

describe("diálogo de importação (só baixa quando aberto)", () => {
  const dialogo = alcance("src/components/roteiro/importar-planilha.tsx");

  it("tampouco importa xlsx, zod, LangChain ou server-only de forma estática", () => {
    for (const ext of dialogo.externos) {
      for (const proibido of PROIBIDOS) expect(ext, `import estático de ${ext}`).not.toMatch(proibido);
    }
  });

  it("não alcança o código do servidor (prompts e schemas da curadoria, action, contexto da Nora)", () => {
    const alcancados = relativos(dialogo);
    for (const f of ["src/lib/ai/roteiro-curadoria.ts", "src/app/dashboard/roteiro-import-actions.ts", "src/lib/ai/nora-contexto.ts", "src/lib/ai/model.ts"]) {
      expect(alcancados, f).not.toContain(f);
    }
  });

  it("a Server Action e o xlsx só entram por import() dinâmico", () => {
    const cliente = readFileSync(path.join(RAIZ, "src/lib/roteiro/curadoria-cliente.ts"), "utf8");
    expect(dinamicos(cliente)).toContain("@/app/dashboard/roteiro-import-actions");
    expect(dinamicos(readFileSync(path.join(RAIZ, "src/lib/roteiro/ler-arquivo.ts"), "utf8"))).toContain("xlsx");
    expect(dinamicos(readFileSync(path.join(RAIZ, "src/lib/roteiro/template-generator.ts"), "utf8"))).toContain("xlsx");
  });
});

describe("no código inteiro", () => {
  const arquivos = [...todosOsArquivos(SRC)];

  it("nenhum módulo importa o xlsx de forma estática, e só 2 o importam dinamicamente", () => {
    const comXlsx: string[] = [];
    for (const f of arquivos) {
      const codigo = readFileSync(f, "utf8");
      expect(estaticos(codigo), path.relative(RAIZ, f)).not.toContain("xlsx");
      if (dinamicos(codigo).includes("xlsx")) comXlsx.push(path.relative(RAIZ, f).replaceAll("\\", "/"));
    }
    expect(comXlsx.sort()).toEqual(["src/lib/roteiro/ler-arquivo.ts", "src/lib/roteiro/template-generator.ts"]);
  });

  it("zod, LangChain e prompts da curadoria só existem no servidor (nenhum módulo cliente os importa)", () => {
    const clientes = arquivos.filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8")) && /roteiro/.test(f));
    expect(clientes.length).toBeGreaterThan(2);
    for (const f of clientes) {
      for (const spec of estaticos(readFileSync(f, "utf8"))) {
        expect(spec, path.relative(RAIZ, f)).not.toMatch(/^(zod|@langchain\/|server-only)/);
        expect(spec, path.relative(RAIZ, f)).not.toMatch(/roteiro-curadoria$|roteiro-import-actions$/);
      }
    }
    // O servidor da curadoria é marcado como tal.
    expect(readFileSync(path.join(SRC, "lib/ai/roteiro-curadoria.ts"), "utf8")).toMatch(/^import "server-only";/m);
  });

  it("os módulos puros do Roteiro não puxam zod nem LangChain", () => {
    for (const nome of ["tipos", "planilha", "csv", "organizar", "fingerprint-roteiro", "apresentacao", "curadoria-cliente", "ler-arquivo", "template-generator"]) {
      const f = path.join(SRC, "lib/roteiro", `${nome}.ts`);
      for (const spec of estaticos(readFileSync(f, "utf8"))) expect(spec, nome).not.toMatch(/^(zod|@langchain\/|server-only|xlsx)/);
    }
  });
});
