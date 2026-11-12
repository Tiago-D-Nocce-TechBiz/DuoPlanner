import type { Page } from "@playwright/test";

/**
 * Apoio dos testes de navegador: contexto do casal guardado no aparelho e
 * Server Actions cortadas (o painel cai na cópia local, como offline).
 */

export const EU = "11111111-1111-4111-8111-111111111111";
export const PAR = "22222222-2222-4222-8222-222222222222";
const ESPACO = "33333333-3333-4333-8333-333333333333";

/** Mesmo formato de `ContextoSincronizacao` (src/lib/sync/contexto.ts). */
export const CONTEXTO = {
  userId: EU,
  email: "ana@teste.dev",
  workspace: { id: ESPACO, nome: "Lisboa 2027", papel: "dono" },
  membros: [
    { userId: EU, nome: "Ana", papel: "dono", pix: null },
    { userId: PAR, nome: "Beto", papel: "parceiro", pix: null },
  ],
  perfil: { nome: "Ana", cidadeBase: "", iataBase: "", pix: null, emailAlertas: true, emailResumoSemanal: true },
  acordo: { regra: "igual", percentualDono: 50, valorFixo: null, quemCobreFixo: "dono", atualizadoEm: null, atualizadoPor: null },
  // Sem as tabelas no "servidor": modo local (a fila espera no aparelho).
  servidorPronto: false,
  criptografiaDocumentos: false,
  iaAtiva: true,
};

export const FATURA = [
  "date,title,amount",
  "2026-10-01,PG *UBER *TRIP,23.45",
  "2026-10-01,PG *UBER *TRIP,23.45",
  "2026-10-03,IFD*IFOOD,55.01",
  "2026-10-04,PADARIA DO ZE,12.30",
  "2026-10-05,AUTO POSTO SAO JORGE,150.00",
  "2026-09-20,MAGAZINE LUIZA PARC 02/10,120.00",
  "2026-10-06,NETFLIX.COM,55.90",
  "2026-10-07,LOJA XYZ PARC 03/12,1234.56",
  "2026-10-08,Pagamento recebido,-1000.00",
].join("\n");

/** Compras (o pagamento da fatura não conta). */
export const COMPRAS_NA_FATURA = 8;

/**
 * Painel com o casal montado no aparelho. As Server Actions falham como sem
 * rede (opcionalmente depois de `atrasoMs`), então o provider usa a cópia
 * guardada e o motor fica em modo local.
 */
export async function abrirPainel(page: Page, caminho: string, opcoes: { atrasoMs?: number } = {}) {
  await page.addInitScript((contexto) => {
    if (!sessionStorage.getItem("pd-e2e-semeado")) {
      localStorage.clear();
      sessionStorage.setItem("pd-e2e-semeado", "1");
    }
    localStorage.setItem("pd-sessao-contexto", JSON.stringify(contexto));
  }, CONTEXTO);
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      if (opcoes.atrasoMs) await new Promise((r) => setTimeout(r, opcoes.atrasoMs));
      return route.abort("internetdisconnected");
    }
    return route.continue();
  });
  await page.goto(caminho);
}

const LOJAS_GERADAS = [
  "PG *UBER *TRIP",
  "IFD*IFOOD",
  "PADARIA DO ZE",
  "AUTO POSTO SAO JORGE",
  "NETFLIX.COM",
  "MERCADO LIVRE",
  "RAIA DROGASIL",
  "LOJA XYZ PARC 03/12",
];

/** Fatura sintética com `n` compras distintas (lojas conhecidas, desconhecidas e parceladas). */
export function faturaComCompras(n: number): string {
  const linhas = ["date,title,amount"];
  for (let i = 0; i < n; i++) {
    const dia = String((i % 28) + 1).padStart(2, "0");
    const valor = (10 + ((i * 37) % 500) + (i % 100) / 100).toFixed(2);
    linhas.push(`2026-10-${dia},${LOJAS_GERADAS[i % LOJAS_GERADAS.length]} ${i},${valor}`);
  }
  return linhas.join("\n");
}

export function arquivoFatura(conteudo = FATURA) {
  return { name: "fatura-outubro.csv", mimeType: "text/csv", buffer: Buffer.from(conteudo, "utf8") };
}
