/* DuoPlanner — Service Worker (cache offline do App Shell e dos dados de leitura).
 *
 * Estratégias:
 *  - /_next/static, ícones, logo, manifesto: cache-first (nomes com hash).
 *  - Páginas do painel que precisam abrir offline (roteiro, checklist,
 *    conversor, finanças...): network-first, com cópia guardada. O HTML do
 *    painel não traz dados do usuário (eles vêm do motor de sincronização,
 *    que guarda a própria cópia); mesmo assim o logout apaga este cache.
 *  - Payload RSC (navegação pelo app): network-first para as mesmas páginas;
 *    sem rede e sem cópia, responde 503 para o Next cair numa navegação
 *    completa, que este SW atende com a página guardada ou a tela offline.
 *  - /api/cotacoes: stale-while-revalidate (o Conversor funciona offline).
 *  - NUNCA: outras /api (buscas pagas, cron), /auth, Server Actions (POST).
 *
 * Caches com dados do usuário usam os prefixos pd-paginas- e pd-dados-
 * (apagados no logout pelo app e pela mensagem "limpar-dados-usuario").
 */

const VERSAO = "v1";
const ESTATICO = `pd-estatico-${VERSAO}`;
const PAGINAS = `pd-paginas-${VERSAO}`;
const DADOS = `pd-dados-${VERSAO}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/brand/logo-96.webp?v=3", "/manifest.webmanifest"];
const PAGINAS_OFFLINE = [
  "/dashboard",
  "/dashboard/roteiro",
  "/dashboard/checklist",
  "/dashboard/conversor",
  "/dashboard/financas",
  "/dashboard/acerto",
  "/dashboard/documentos",
  "/dashboard/alertas",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ESTATICO)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const atuais = [ESTATICO, PAGINAS, DADOS];
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n.startsWith("pd-") && !atuais.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

function caminho(url) {
  return url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
}

function paginaOffline(url) {
  return PAGINAS_OFFLINE.includes(caminho(url));
}

function estatico(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/icon.png" ||
    url.pathname === "/apple-icon.png"
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(ESTATICO);
  const salvo = await cache.match(request);
  if (salvo) return salvo;
  const resposta = await fetch(request);
  if (resposta.ok && resposta.type === "basic") cache.put(request, resposta.clone());
  return resposta;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DADOS);
  const salvo = await cache.match(request);
  const rede = fetch(request)
    .then((resposta) => {
      if (resposta.ok) cache.put(request, resposta.clone());
      return resposta;
    })
    .catch(() => undefined);
  return salvo || (await rede) || new Response(JSON.stringify({ ok: false, mensagem: "Sem conexão." }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function rscPrimeiroRede(request) {
  const cache = await caches.open(PAGINAS);
  try {
    const resposta = await fetch(request);
    // O parâmetro _rsc identifica a variante (estado do router): a URL inteira é a chave.
    if (resposta.ok && !resposta.redirected) cache.put(request, resposta.clone());
    return resposta;
  } catch {
    const salvo = await cache.match(request, { ignoreVary: true });
    // 503 (e não erro de rede): o Next faz uma navegação completa, atendida abaixo.
    return salvo || new Response("", { status: 503, headers: { "X-DuoPlanner-Offline": "1" } });
  }
}

async function navegacao(request, url) {
  try {
    const resposta = await fetch(request);
    // Redirecionamento (ex.: sessão expirada → /login) nunca é guardado.
    if (resposta.ok && !resposta.redirected && paginaOffline(url)) {
      const cache = await caches.open(PAGINAS);
      cache.put(caminho(url), resposta.clone());
    }
    return resposta;
  } catch {
    const salva = paginaOffline(url) ? await (await caches.open(PAGINAS)).match(caminho(url)) : undefined;
    return salva || (await caches.match(OFFLINE)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/auth/")) return;
  if (url.pathname.startsWith("/api/") && url.pathname !== "/api/cotacoes") return;

  if (estatico(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname === "/api/cotacoes") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  const ehRsc = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (ehRsc) {
    if (paginaOffline(url)) event.respondWith(rscPrimeiroRede(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(navegacao(request, url));
  }
});

/** Guarda as páginas offline e os arquivos de cada uma (uma vez por sessão). */
async function aquecer() {
  const paginas = await caches.open(PAGINAS);
  const arquivos = await caches.open(ESTATICO);
  for (const pagina of PAGINAS_OFFLINE) {
    try {
      const resposta = await fetch(pagina, { credentials: "same-origin" });
      if (!resposta.ok || resposta.redirected) continue;
      const html = await resposta.clone().text();
      await paginas.put(pagina, resposta);
      const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
      await Promise.all(
        assets.map(async (asset) => {
          if (await arquivos.match(asset)) return;
          const r = await fetch(asset);
          if (r.ok) await arquivos.put(asset, r);
        })
      );
    } catch {
      // Sem rede no meio do caminho: tenta na próxima sessão.
    }
  }
}

self.addEventListener("message", (event) => {
  const dados = event.data || {};
  if (dados.tipo === "limpar-dados-usuario") {
    event.waitUntil(Promise.all([caches.delete(PAGINAS), caches.delete(DADOS)]));
  } else if (dados.tipo === "aquecer") {
    event.waitUntil(aquecer());
  }
});
