import { readFile } from "node:fs/promises";
import path from "node:path";
import { transformAsync } from "@babel/core";
import pluginReactCompiler from "babel-plugin-react-compiler";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { build, type Plugin } from "rolldown";

/**
 * Pacotes de navegador com o React de PRODUÇÃO, para cronometrar telas fora
 * do `next dev` (React de desenvolvimento é várias vezes mais lento: serve
 * para o fluxo, não para medir). Usados por `importador-producao.spec.ts` e
 * `painel-producao.spec.ts`, servidos pelo próprio teste com `page.route`.
 *
 * O código do app passa pelo React Compiler como no build (`reactCompiler:
 * true` no `next.config.ts`). Para medir sem ele (comparação antes/depois):
 * `PD_SEM_REACT_COMPILER=1 npx playwright test ...`.
 */

const VAZIO = '""';

/**
 * React Compiler no pacote, com as opções que o Next usa no build de
 * produção (`get-babel-loader-config.js`): só o código do app (nada de
 * `node_modules`), padrão "infer" (componentes e hooks) e erro de compilação
 * deixando a função como está, sem quebrar o build.
 */
function reactCompiler(raiz: string): Plugin {
  const src = path.join(raiz, "src") + path.sep;
  return {
    name: "react-compiler",
    async transform(codigo, id) {
      if (!id.startsWith(src) || !/\.tsx?$/.test(id) || !/use[A-Z]|<[A-Za-z]/.test(codigo)) return null;
      const r = await transformAsync(codigo, {
        filename: id,
        babelrc: false,
        configFile: false,
        sourceMaps: false,
        parserOpts: { plugins: id.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"] },
        plugins: [[pluginReactCompiler, { environment: { enableNameAnonymousFunctions: false } }]],
      });
      return r?.code ?? null;
    },
  };
}

/**
 * Empacota `entrada` (caminho relativo à raiz) com o alias `@` do app.
 * `substitutos`: módulo do app → arquivo (relativo à raiz) que entra no lugar.
 */
export async function montarPacote(raiz: string, entrada: string, substitutos: Record<string, string> = {}): Promise<string> {
  const { output } = await build({
    input: path.join(raiz, entrada),
    cwd: raiz,
    platform: "browser",
    write: false,
    plugins: [
      {
        name: "substitutos",
        resolveId: (id) => (Object.hasOwn(substitutos, id) ? path.join(raiz, substitutos[id]) : null),
      },
      process.env.PD_SEM_REACT_COMPILER === "1" ? null : reactCompiler(raiz),
    ],
    resolve: { alias: { "@": path.join(raiz, "src") } },
    transform: {
      jsx: { runtime: "automatic", development: false },
      define: {
        "process.env.NODE_ENV": '"production"',
        // Sem Supabase: o ambiente público sai vazio, como num aparelho sem conta.
        "process.env.NEXT_PUBLIC_SUPABASE_URL": VAZIO,
        "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": VAZIO,
        "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": VAZIO,
        "process.env.NEXT_PUBLIC_SITE_URL": VAZIO,
      },
    },
    output: { format: "iife", minify: true },
    // "use client" não significa nada num pacote só de navegador.
    onLog: (nivel, log) => {
      if (log.code !== "MODULE_LEVEL_DIRECTIVE") throw new Error(`[rolldown] ${nivel}: ${log.message}`);
    },
  });
  return output[0].code;
}

/**
 * O CSS do app como sai do build: Tailwind v4 com as classes achadas em
 * `src/` e o mesmo otimizador (Lightning CSS). Sem ele, layout, breakpoints e
 * `content-visibility` não contam na medida.
 */
export async function montarCss(raiz: string): Promise<string> {
  const base = path.join(raiz, "src/app");
  const compilador = await compile(await readFile(path.join(base, "globals.css"), "utf8"), { base, onDependency: () => {} });
  // Mesma regra do CLI do Tailwind: sem `source(...)` no CSS, procura classes
  // a partir da raiz do projeto (respeitando o .gitignore).
  const raizDasClasses =
    compilador.root === "none"
      ? []
      : compilador.root
        ? [{ ...compilador.root, negated: false }]
        : [{ base: raiz, pattern: "**/*", negated: false }];
  const candidatos = new Scanner({ sources: [...raizDasClasses, ...compilador.sources] }).scan();
  return optimize(compilador.build(candidatos), { minify: true }).code;
}

/** Página mínima que carrega o pacote (e o CSS, se houver). */
export function paginaDoPacote({ js, css }: { js: string; css?: string }): (url: string) => { contentType: string; body: string } {
  return (url) => {
    if (url.endsWith("/pacote.js")) return { contentType: "text/javascript", body: js };
    if (url.endsWith("/pacote.css")) return { contentType: "text/css", body: css ?? "" };
    return {
      contentType: "text/html",
      body: `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${
        css ? '<link rel="stylesheet" href="/pacote.css">' : ""
      }<body><main class="p-4"><div id="raiz"></div></main><script src="/pacote.js"></script>`,
    };
  };
}
