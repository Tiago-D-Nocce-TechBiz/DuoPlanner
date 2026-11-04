"use client";

import { importarDocumentosLegados } from "@/app/dashboard/documentos/actions";
import { todayInSaoPaulo } from "@/lib/dates";
import { operacoesDoLegado } from "./importacao";
import { CHAVES_LEGADAS, lerDadosLegados, removerLegado, type AreaLegada } from "./legado";
import { enfileirarOperacoes, getContexto } from "./motor";

/**
 * Importação (com consentimento) dos dados salvos no navegador antes da
 * sincronização. Gastos, roteiro, checklist e alertas entram na fila de
 * sincronização; documentos vão direto ao servidor para serem cifrados.
 */

export interface ResultadoImportacaoLegado {
  importados: number;
  descartados: number;
  documentos: number;
  aviso?: string;
}

export async function importarDadosLegados(): Promise<ResultadoImportacaoLegado> {
  const ctx = getContexto();
  if (!ctx) throw new Error("Sincronização ainda não iniciada.");
  if (!ctx.workspace) throw new Error("O espaço do casal ainda não está pronto. Tente de novo em instantes.");

  const dados = lerDadosLegados(window.localStorage);
  const { operacoes, descartados } = operacoesDoLegado(dados, {
    userId: ctx.userId,
    workspaceId: ctx.workspace.id,
    hoje: todayInSaoPaulo(),
    agora: new Date().toISOString(),
    novoId: () => crypto.randomUUID(),
  });
  enfileirarOperacoes(operacoes);
  const areasNaFila: AreaLegada[] = ["despesas", "roteiro", "checklist", "alertas"];
  removerLegado(window.localStorage, areasNaFila);

  let documentos = 0;
  let aviso: string | undefined;
  if (dados.documentos.length > 0) {
    const r = await importarDocumentosLegados(
      dados.documentos.map((d) => ({ tipo: d.tipo, titular: d.titular, numero: d.numero, observacao: d.observacao }))
    );
    if (r.ok) {
      documentos = r.importados;
      aviso = r.aviso;
      removerLegado(window.localStorage, ["documentos"]);
    } else {
      // Mantém os documentos antigos: tentaremos de novo quando o servidor permitir.
      aviso = `Documentos não importados agora: ${r.mensagem}`;
    }
  }
  return { importados: operacoes.length, descartados, documentos, aviso };
}

/** Apaga os dados antigos deste navegador sem importar (não são desta conta). */
export function descartarDadosLegados() {
  removerLegado(window.localStorage, Object.keys(CHAVES_LEGADAS) as AreaLegada[]);
}
