import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as icones from "@/components/ui/icons";
import { ICONES_DA_NORA } from "@/components/ai/nora-icones";
import {
  ESTRATEGIAS,
  ESTRATEGIA_IDS,
  CONTEXTO_VAZIO,
  estrategiaPorId,
  filtrarComandos,
  interpretarComando,
  temEstimativaEmReais,
} from "./nora-strategies";
import { analiseLocal } from "./nora-strategies-local";

vi.mock("server-only", () => ({}));

describe("catálogo das 9 estratégias", () => {
  it("tem as 9 estratégias, com comandos, apelidos e rótulos únicos", () => {
    expect(ESTRATEGIAS).toHaveLength(9);
    expect(ESTRATEGIAS.map((e) => e.id).sort()).toEqual([...ESTRATEGIA_IDS].sort());
    const comandos = ESTRATEGIAS.flatMap((e) => [e.slashCommand, ...e.apelidos]);
    expect(new Set(comandos).size).toBe(comandos.length);
    expect(new Set(ESTRATEGIAS.map((e) => e.label)).size).toBe(9);
    for (const e of ESTRATEGIAS) {
      expect(e.slashCommand).toMatch(/^\/[a-z0-9-]+$/);
      expect(e.shortDescription.length).toBeGreaterThan(10);
      expect(estrategiaPorId(e.id)).toBe(e);
    }
  });

  it("todo iconName existe no conjunto de ícones do projeto e no mapa da Nora", () => {
    for (const e of ESTRATEGIAS) {
      expect(ICONES_DA_NORA[e.iconName]).toBeTypeOf("function");
      expect((icones as Record<string, unknown>)[e.iconName]).toBe(ICONES_DA_NORA[e.iconName]);
    }
  });
});

describe("filtrarComandos", () => {
  it("sem texto, mostra os 9", () => {
    expect(filtrarComandos("")).toHaveLength(9);
  });

  it("filtra pelo começo do comando, sem acento e sem diferenciar maiúsculas", () => {
    expect(filtrarComandos("aud").map((e) => e.id)).toEqual(["auditoria_voo"]);
    expect(filtrarComandos("AEROP").map((e) => e.id)).toEqual(["aeroportos_proximos"]);
    expect(filtrarComandos("conexões").map((e) => e.id)).toEqual(["conexoes_inteligentes"]);
  });

  it("quem começa com o texto vem antes de quem só contém", () => {
    const ids = filtrarComandos("o").map((e) => e.id);
    expect(ids.length).toBeGreaterThan(1);
    expect(filtrarComandos("otimizar")[0].id).toBe("otimizacao_orcamento");
  });

  it("acha pelo apelido e pelo rótulo", () => {
    expect(filtrarComandos("cortar-20").map((e) => e.id)).toContain("otimizacao_orcamento");
    expect(filtrarComandos("onde ficar").map((e) => e.id)).toContain("escolha_bairros");
  });

  it("texto sem correspondência devolve vazio", () => {
    expect(filtrarComandos("zzzz")).toEqual([]);
  });
});

describe("interpretarComando", () => {
  it("reconhece o comando completo e separa o resto do texto", () => {
    const r = interpretarComando("/auditar-voo GRU-LIS por R$ 4.200");
    expect(r?.estrategia.id).toBe("auditoria_voo");
    expect(r?.resto).toBe("GRU-LIS por R$ 4.200");
  });

  it("aceita apelido e comando sozinho", () => {
    expect(interpretarComando("/cortar-20")?.estrategia.id).toBe("otimizacao_orcamento");
    expect(interpretarComando("  /veredito  ")?.resto).toBe("");
  });

  it("comando desconhecido ou texto comum não é comando", () => {
    expect(interpretarComando("/xyz algo")).toBeNull();
    expect(interpretarComando("quero passagens")).toBeNull();
    expect(interpretarComando("/audit")).toBeNull();
  });
});

describe("módulos do navegador", () => {
  const raiz = process.cwd();
  const arquivos = [
    "src/lib/ai/nora-strategies.ts",
    "src/lib/ai/nora-strategies-local.ts",
    "src/components/ai/nora-estrategias.tsx",
    "src/components/ai/nora-card-analise.tsx",
    "src/components/ai/nora-consulta.ts",
    "src/components/ai/nora-acoes-analise.ts",
    "src/components/ai/nora-icones.ts",
  ];

  it.each(arquivos)("%s não importa zod, LangChain nem código só de servidor", (arquivo) => {
    const codigo = readFileSync(join(raiz, arquivo), "utf8");
    const importados = [...codigo.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const origem of importados) {
      expect(origem).not.toMatch(/^(zod|@langchain\/|server-only)/);
      expect(origem).not.toMatch(/nora-(strategies-servidor|advisor|contexto)$/);
    }
  });
});

describe("lista de conferência local", () => {
  it("existe e é útil para as 9 estratégias, sem veredito nem nota", () => {
    for (const id of ESTRATEGIA_IDS) {
      const a = analiseLocal(id, CONTEXTO_VAZIO);
      expect(a.resumo.length).toBeGreaterThan(10);
      expect(a.recomendacaoPratica.length).toBeGreaterThan(10);
      expect(a.pontosDeAtencao.length + a.opcoes.length).toBeGreaterThan(0);
      expect(a.vereditoBadge).toBeNull();
      expect(a.notaCustoBeneficio).toBeNull();
      expect(temEstimativaEmReais(a)).toBe(false);
    }
  });

  it("usa o destino da viagem quando conhece", () => {
    const a = analiseLocal("aeroportos_proximos", { ...CONTEXTO_VAZIO, destino: "Lisboa" });
    expect(JSON.stringify(a)).toContain("Lisboa");
  });
});
