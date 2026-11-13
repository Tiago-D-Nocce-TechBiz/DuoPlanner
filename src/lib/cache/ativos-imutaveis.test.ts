import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATIVOS_IMUTAVEIS, rotasImutaveis } from "./ativos-imutaveis";
import registro from "./hashes-ativos-imutaveis.json";

/**
 * Guarda do cache de um ano (`immutable`) nos arquivos de `public/` sem hash
 * no nome. Se este teste falhou porque um arquivo mudou de conteúdo:
 *   1. troque a URL (renomeie, ou mude o `?v=` onde ele é referenciado),
 *      senão quem já baixou fica com a versão antiga por até um ano;
 *   2. só então atualize `hashes-ativos-imutaveis.json`.
 */

const PUBLIC = new URL("../../../public/", import.meta.url);

function arquivosServidos(): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const { pasta, extensoes } of ATIVOS_IMUTAVEIS) {
    for (const nome of readdirSync(new URL(`${pasta}/`, PUBLIC))) {
      if (!(extensoes as readonly string[]).includes(nome.split(".").pop() ?? "")) continue;
      const conteudo = readFileSync(new URL(`${pasta}/${nome}`, PUBLIC));
      hashes.set(`/${pasta}/${nome}`, createHash("sha256").update(conteudo).digest("hex"));
    }
  }
  return hashes;
}

describe("arquivos de public/ com cache imutável", () => {
  const atuais = arquivosServidos();
  const registrados = new Map(Object.entries(registro as Record<string, string>));

  it("nenhum mudou de conteúdo mantendo a mesma URL", () => {
    const mudaram = [...atuais].filter(([url, hash]) => registrados.has(url) && registrados.get(url) !== hash).map(([url]) => url);
    expect(mudaram, "troque a URL desses arquivos antes de atualizar o registro (cache de 1 ano)").toEqual([]);
  });

  it("o registro lista exatamente os arquivos servidos (nenhum novo sem hash, nenhum removido)", () => {
    expect([...atuais.keys()].sort()).toEqual([...registrados.keys()].sort());
  });

  it("as rotas do cabeçalho cobrem só essas pastas e extensões", () => {
    expect(rotasImutaveis()).toEqual([
      "/icons/:arquivo(.*\\.(?:png))",
      "/brand/:arquivo(.*\\.(?:webp|png))",
      "/models/:arquivo(.*\\.(?:glb|gltf))",
    ]);
  });
});
