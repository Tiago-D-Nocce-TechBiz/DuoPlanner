import type { Page } from "@playwright/test";

/**
 * Apoio dos testes de navegador: contexto do casal guardado no aparelho e
 * Server Actions cortadas (o painel cai na cópia local, como offline).
 */

export const EU = "11111111-1111-4111-8111-111111111111";
export const PAR = "22222222-2222-4222-8222-222222222222";
export const ESPACO = "33333333-3333-4333-8333-333333333333";

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
 *
 * `armazenamento`: chaves extras do localStorage gravadas só na primeira
 * carga da sessão (ex.: a cópia do motor com centenas de gastos); recarregar
 * a página mantém o que o teste mudou.
 */
export async function abrirPainel(
  page: Page,
  caminho: string,
  opcoes: { atrasoMs?: number; armazenamento?: Record<string, string> } = {}
) {
  await page.addInitScript(
    ({ contexto, armazenamento }) => {
      if (!sessionStorage.getItem("pd-e2e-semeado")) {
        localStorage.clear();
        for (const [chave, valor] of Object.entries(armazenamento)) localStorage.setItem(chave, valor);
        sessionStorage.setItem("pd-e2e-semeado", "1");
      }
      localStorage.setItem("pd-sessao-contexto", JSON.stringify(contexto));
    },
    { contexto: CONTEXTO, armazenamento: opcoes.armazenamento ?? {} }
  );
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

const LOJAS_DA_VIAGEM = ["Pastelaria Belém", "Uber", "Mercado da Ribeira", "Museu do Azulejo", "Farmácia Estácio", "Tram 28", "Padaria do Bairro", "Time Out Market"];
const CATEGORIAS_DA_VIAGEM = ["Alimentação & Gastronomia", "Passagens & Transporte", "Passeios & Lazer", "Hospedagem"];

/** `n` gastos de uma fatura grande importada, já "no servidor". 1 em cada 7 é pessoal. */
function gastosDaViagem(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const privado = i % 7 === 6;
    const dia = String((i % 28) + 1).padStart(2, "0");
    const mes = ["10", "11", "12"][i % 3];
    const quando = `2026-${mes}-${dia}T12:00:00.000Z`;
    return {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      userId: EU,
      workspaceId: ESPACO,
      pagoPor: privado ? null : i % 2 ? PAR : EU,
      tipo: "gasto",
      descricao: `${LOJAS_DA_VIAGEM[i % LOJAS_DA_VIAGEM.length]} ${i}`,
      valor: 10 + ((i * 37) % 400) + (i % 100) / 100,
      moeda: "BRL",
      cotacaoBrl: null,
      data: quando.slice(0, 10),
      categoria: privado ? "Gasto Pessoal (Fora da Viagem)" : CATEGORIAS_DA_VIAGEM[i % CATEGORIAS_DA_VIAGEM.length],
      escopo: privado ? "pessoal_privado" : "viagem_compartilhado",
      proporcaoDivisao: null,
      origem: "importacao",
      oQueFoiGasto: i % 3 ? "Compra no cartão" : null,
      categoriaDetalhada: null,
      criadoEm: quando,
      atualizadoEm: quando,
      atualizadoPor: EU,
    };
  });
}

/** Roteiro com `dias` dias e `porDia` atividades em cada um. */
function roteiroDaViagem(dias: number, porDia: number) {
  const quando = "2026-11-01T12:00:00.000Z";
  const roteiro_dias = Array.from({ length: dias }, (_, d) => ({
    id: `10000000-0000-4000-8000-${String(d).padStart(12, "0")}`,
    workspaceId: ESPACO,
    userId: EU,
    data: `2027-03-${String((d % 28) + 1).padStart(2, "0")}`,
    ordem: d,
    atualizadoEm: quando,
    atualizadoPor: EU,
  }));
  const roteiro_itens = roteiro_dias.flatMap((dia, d) =>
    Array.from({ length: porDia }, (_, i) => ({
      id: `20000000-0000-4000-8000-${String(d * 100 + i).padStart(12, "0")}`,
      workspaceId: ESPACO,
      diaId: dia.id,
      horario: `${String(8 + i * 2).padStart(2, "0")}:00`,
      titulo: `Atividade ${i + 1} do dia ${d + 1}`,
      nota: i % 2 ? "Reserva confirmada" : "",
      ordem: i,
      atualizadoEm: quando,
      atualizadoPor: EU,
    }))
  );
  return { roteiro_dias, roteiro_itens };
}

/**
 * Cópia do motor de sincronização (chave `pd-sync:<usuário>`) como se o
 * aparelho já tivesse baixado do servidor: `gastos` gastos e um roteiro de
 * `roteiro.dias` × `roteiro.porDia` atividades.
 */
export function copiaDoMotor({ gastos = 0, roteiro }: { gastos?: number; roteiro?: { dias: number; porDia: number } }): Record<string, string> {
  const servidor = { despesas: gastosDaViagem(gastos), ...(roteiro ? roteiroDaViagem(roteiro.dias, roteiro.porDia) : {}) };
  const copia = { v: 1, workspaceId: ESPACO, servidor, fila: [], ultimaSincronizacao: null };
  return { [`pd-sync:${EU}`]: JSON.stringify(copia) };
}

/** Atalho: só os gastos. */
export const copiaDoMotorComGastos = (n: number) => copiaDoMotor({ gastos: n });
