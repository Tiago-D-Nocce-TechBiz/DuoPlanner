/**
 * Arquivos de `public/` servidos com cache de um ano (`immutable`): ícones do
 * app, versões da marca e o modelo 3D. Lido pelo `next.config.ts` (cabeçalho)
 * e pelo teste `ativos-imutaveis.test.ts`.
 *
 * Esses nomes NÃO têm hash do conteúdo (diferente de `/_next/static/`, que o
 * Next já serve assim). Trocar o conteúdo mantendo a URL deixaria quem já
 * baixou com a versão antiga por até um ano. Por isso o teste compara cada
 * arquivo com o hash registrado em `hashes-ativos-imutaveis.json`: mudou o
 * conteúdo, mude também a URL (outro nome ou `?v=` novo) e só então atualize
 * o registro. Fontes não entram aqui: o `next/font` já as serve de
 * `/_next/static/media/` com hash e cache imutável.
 *
 * Só imports relativos (nenhum): o `next.config.ts` carrega este arquivo.
 * O registro JSON tem outro nome de propósito: com o mesmo nome base
 * (`ativos-imutaveis.json`), o carregador do next.config resolvia o import
 * para o JSON em vez deste módulo.
 */

export const CACHE_IMUTAVEL = "public, max-age=31536000, immutable";

export const ATIVOS_IMUTAVEIS = [
  { pasta: "icons", extensoes: ["png"] },
  { pasta: "brand", extensoes: ["webp", "png"] },
  { pasta: "models", extensoes: ["glb", "gltf"] },
] as const;

/** Padrões de `source` do `headers()` do Next (path-to-regexp). */
export function rotasImutaveis(): string[] {
  return ATIVOS_IMUTAVEIS.map(({ pasta, extensoes }) => `/${pasta}/:arquivo(.*\\.(?:${extensoes.join("|")}))`);
}
