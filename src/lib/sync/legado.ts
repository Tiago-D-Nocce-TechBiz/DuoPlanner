/**
 * Dados salvos no navegador ANTES da sincronização (formato antigo, sem dono).
 *
 * Até esta versão, Finanças, Roteiro, Checklist, Documentos e Alertas viviam
 * só no localStorage, sem indicação de qual conta os criou. Por isso eles
 * nunca são importados sozinhos: a pessoa logada confirma ("Importar para a
 * minha conta?"). Num navegador compartilhado, os dados podem ser de outra.
 *
 * Funções puras sobre um Storage (testáveis no Node).
 */

export const CHAVES_LEGADAS = {
  despesas: "pd-financas-despesas",
  roteiro: "pd-roteiro",
  checklist: "pd-checklist",
  documentos: "pd-documentos",
  alertas: "pd-alertas-preco",
} as const;

export type AreaLegada = keyof typeof CHAVES_LEGADAS;

export interface DespesaLegada {
  id: string;
  data: string; // dd/mm/aaaa
  estabelecimento: string;
  valor: number;
  categoriaDestino: string;
  escopo: string;
  origem: string;
}

export interface DiaLegado {
  id: string;
  data: string; // AAAA-MM-DD ou ""
  itens: { id: string; horario: string; titulo: string; nota: string }[];
}

export interface ItemChecklistLegado {
  id: string;
  texto: string;
  feito: boolean;
  categoria: string;
}

export interface DocumentoLegado {
  id: string;
  tipo: string;
  titular: string;
  numero: string;
  observacao: string;
}

export interface AlertaLegado {
  id: string;
  tipo: string;
  origem: string;
  destino: string;
  ida: string;
  volta: string;
  precoAlvo: string;
}

export interface DadosLegados {
  despesas: DespesaLegada[];
  roteiro: DiaLegado[];
  checklist: ItemChecklistLegado[];
  documentos: DocumentoLegado[];
  alertas: AlertaLegado[];
}

type StorageLeitura = Pick<Storage, "getItem">;

function lerLista(storage: StorageLeitura, chave: string): unknown[] {
  try {
    const bruto = storage.getItem(chave);
    if (!bruto) return [];
    const valor: unknown = JSON.parse(bruto);
    return Array.isArray(valor) ? valor : [];
  } catch {
    return [];
  }
}

const texto = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Lê e saneia os dados antigos. Entradas malformadas são descartadas. */
export function lerDadosLegados(storage: StorageLeitura): DadosLegados {
  const despesas = lerLista(storage, CHAVES_LEGADAS.despesas)
    .filter(objeto)
    .map((d) => ({
      id: texto(d.id, 64),
      data: texto(d.data, 10),
      estabelecimento: texto(d.estabelecimento, 120),
      valor: typeof d.valor === "number" && Number.isFinite(d.valor) ? d.valor : NaN,
      categoriaDestino: texto(d.categoriaDestino, 60),
      escopo: texto(d.escopo, 30),
      origem: texto(d.origem, 20),
    }))
    .filter((d) => d.estabelecimento && d.valor > 0);

  const roteiro = lerLista(storage, CHAVES_LEGADAS.roteiro)
    .filter(objeto)
    .map((dia) => ({
      id: texto(dia.id, 64),
      data: texto(dia.data, 10),
      itens: (Array.isArray(dia.itens) ? dia.itens : []).filter(objeto).map((it) => ({
        id: texto(it.id, 64),
        horario: texto(it.horario, 5),
        titulo: texto(it.titulo, 120),
        nota: texto(it.nota, 500),
      })),
    }));

  const checklist = lerLista(storage, CHAVES_LEGADAS.checklist)
    .filter(objeto)
    .map((i) => ({
      id: texto(i.id, 64),
      texto: texto(i.texto, 120),
      feito: i.feito === true,
      categoria: texto(i.categoria, 40),
    }))
    .filter((i) => i.texto);

  const documentos = lerLista(storage, CHAVES_LEGADAS.documentos)
    .filter(objeto)
    .map((d) => ({
      id: texto(d.id, 64),
      tipo: texto(d.tipo, 40),
      titular: texto(d.titular, 120),
      numero: texto(d.numero, 64),
      observacao: texto(d.observacao, 300),
    }))
    .filter((d) => d.titular || d.numero);

  const alertas = lerLista(storage, CHAVES_LEGADAS.alertas)
    .filter(objeto)
    .map((a) => ({
      id: texto(a.id, 64),
      tipo: texto(a.tipo, 20),
      origem: texto(a.origem, 80),
      destino: texto(a.destino, 80),
      ida: texto(a.ida, 10),
      volta: texto(a.volta, 10),
      precoAlvo: texto(a.precoAlvo, 20),
    }))
    .filter((a) => a.destino && a.ida);

  return { despesas, roteiro, checklist, documentos, alertas };
}

/** Quantos itens antigos existem por área (dias do roteiro contam itens + dias). */
export function contarDadosLegados(dados: DadosLegados): Record<AreaLegada, number> {
  return {
    despesas: dados.despesas.length,
    roteiro: dados.roteiro.reduce((total, dia) => total + 1 + dia.itens.length, 0),
    checklist: dados.checklist.length,
    documentos: dados.documentos.length,
    alertas: dados.alertas.length,
  };
}

export function totalLegado(dados: DadosLegados): number {
  return Object.values(contarDadosLegados(dados)).reduce((a, b) => a + b, 0);
}

/** Remove as chaves antigas de uma área (depois de importar ou descartar). */
export function removerLegado(storage: Pick<Storage, "removeItem">, areas: AreaLegada[]): void {
  for (const area of areas) storage.removeItem(CHAVES_LEGADAS[area]);
}

/** Apaga todos os dados antigos deste navegador sem importar (não são desta conta). */
export function descartarDadosLegados(storage: Pick<Storage, "removeItem">): void {
  removerLegado(storage, Object.keys(CHAVES_LEGADAS) as AreaLegada[]);
}
