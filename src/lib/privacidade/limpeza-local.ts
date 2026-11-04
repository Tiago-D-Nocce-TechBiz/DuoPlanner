/**
 * Limpeza dos dados do usuário guardados no navegador (logout).
 *
 * Tudo o que é dado de pessoa usa o prefixo `pd-` (localStorage e
 * sessionStorage) ou um cache do Service Worker com prefixo `pd-paginas-` /
 * `pd-dados-`. Preferências do APARELHO (tema, aviso de instalação
 * dispensado) usam `duoplanner-` e ficam: não identificam ninguém.
 *
 * Sem isso, a próxima pessoa no mesmo navegador via finanças, roteiro e
 * notificações da conta anterior.
 */

export const PREFIXO_DADOS = "pd-";
export const PREFIXOS_CACHE_DO_USUARIO = ["pd-paginas-", "pd-dados-"] as const;
/** Disparado após a limpeza para os stores em memória zerarem o estado. */
export const EVENTO_DADOS_LIMPOS = "pd:dados-locais-limpos";

type StorageLike = Pick<Storage, "length" | "key" | "removeItem">;

/** Remove todas as chaves com o prefixo. Devolve quantas removeu. */
export function limparChavesDoStorage(storage: StorageLike, prefixo = PREFIXO_DADOS): number {
  const chaves: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const chave = storage.key(i);
    if (chave && chave.startsWith(prefixo)) chaves.push(chave);
  }
  for (const chave of chaves) storage.removeItem(chave);
  return chaves.length;
}

/** O nome do cache do SW guarda dados do usuário (páginas e respostas privadas). */
export function cacheDoUsuario(nome: string): boolean {
  return PREFIXOS_CACHE_DO_USUARIO.some((prefixo) => nome.startsWith(prefixo));
}

/** Limpa storage, caches do SW com dados do usuário e avisa os stores. */
export async function limparDadosLocais(): Promise<void> {
  if (typeof window === "undefined") return;
  // 1º avisa os stores (síncrono): o motor de sincronização para, cancela as
  // gravações agendadas e esquece o usuário. Se a ordem fosse a inversa, uma
  // gravação pendente poderia reescrever `pd-sync:*` depois da limpeza.
  window.dispatchEvent(new Event(EVENTO_DADOS_LIMPOS));
  try {
    limparChavesDoStorage(window.localStorage);
  } catch {
    // Storage indisponível (modo privado): nada a limpar.
  }
  try {
    limparChavesDoStorage(window.sessionStorage);
  } catch {
    // idem
  }
  try {
    navigator.serviceWorker?.controller?.postMessage({ tipo: "limpar-dados-usuario" });
  } catch {
    // Sem Service Worker ativo.
  }
  try {
    if ("caches" in window) {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter(cacheDoUsuario).map((nome) => caches.delete(nome)));
    }
  } catch {
    // Cache Storage indisponível (ex.: http em desenvolvimento).
  }
}
