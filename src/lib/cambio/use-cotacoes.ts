"use client";

import { useSyncExternalStore } from "react";
import { fetchWithTimeout } from "@/lib/http/fetch-com-limite";
import { formatadorDeMoeda } from "@/lib/utils";

/**
 * Cotações do dia no navegador (1 unidade = X reais).
 *
 * Abre com valores de REFERÊNCIA (iguais no servidor e no cliente: sem
 * hydration mismatch) e, depois de montar, busca `/api/cotacoes` (AwesomeAPI,
 * cache de 1 hora; o Service Worker guarda a última resposta para uso
 * offline). Sem rede, fica com as referências.
 *
 * Uma busca por aba, compartilhada: várias partes da tela (formulário,
 * recibo, conversor) usam o mesmo resultado em vez de repetir o pedido.
 * Depois de 1 hora, a próxima tela que montar busca de novo.
 */

export const MOEDAS: { codigo: string; nome: string; simbolo: string; referencia: number }[] = [
  { codigo: "BRL", nome: "Real", simbolo: "R$", referencia: 1 },
  { codigo: "USD", nome: "Dólar americano", simbolo: "US$", referencia: 5.4 },
  { codigo: "EUR", nome: "Euro", simbolo: "€", referencia: 5.9 },
  { codigo: "GBP", nome: "Libra", simbolo: "£", referencia: 6.9 },
  { codigo: "ARS", nome: "Peso argentino", simbolo: "AR$", referencia: 0.0055 },
  { codigo: "CLP", nome: "Peso chileno", simbolo: "CLP$", referencia: 0.0057 },
];

export const TAXAS_REFERENCIA: Record<string, number> = Object.fromEntries(
  MOEDAS.map((m) => [m.codigo, m.referencia])
);

export type EstadoCotacao =
  | { estado: "carregando" }
  | { estado: "ao-vivo"; de: string; ate: string; fonte: string }
  | { estado: "referencia"; mensagem: string };

interface RespostaCotacoes {
  ok: boolean;
  taxas?: Record<string, number>;
  atualizadoDe?: string;
  atualizadoAte?: string;
  fonte?: string;
  mensagem?: string;
}

interface Cotacoes {
  taxas: Record<string, number>;
  cotacao: EstadoCotacao;
}

const INICIAL: Cotacoes = { taxas: TAXAS_REFERENCIA, cotacao: { estado: "carregando" } };
const VALIDADE_MS = 60 * 60 * 1000;
const INDISPONIVEL = "Cotação ao vivo indisponível agora.";

let atual: Cotacoes = INICIAL;
let buscadoEm = 0;
let buscando = false;
const ouvintes = new Set<() => void>();

function publicar(proximo: Cotacoes) {
  atual = proximo;
  for (const ouvinte of ouvintes) ouvinte();
}

async function buscar() {
  buscando = true;
  try {
    // Com prazo: um pedido pendurado deixava `buscando` ligado e ninguém na
    // aba tentava de novo até recarregar a página.
    const res = await fetchWithTimeout("/api/cotacoes", { headers: { accept: "application/json" } });
    const dados = (await res.json()) as RespostaCotacoes;
    if (!dados.ok || !dados.taxas) {
      publicar({ taxas: atual.taxas, cotacao: { estado: "referencia", mensagem: dados.mensagem ?? INDISPONIVEL } });
      return;
    }
    const taxas = { ...atual.taxas };
    for (const [codigo, taxa] of Object.entries(dados.taxas)) {
      if (Number.isFinite(taxa) && taxa > 0) taxas[codigo] = taxa;
    }
    buscadoEm = Date.now();
    publicar({
      taxas,
      cotacao: {
        estado: "ao-vivo",
        de: dados.atualizadoDe ?? "",
        ate: dados.atualizadoAte ?? dados.atualizadoDe ?? "",
        fonte: dados.fonte ?? "AwesomeAPI",
      },
    });
  } catch {
    // Sem rede: fica com o que já tem; a próxima tela que montar tenta de novo.
    publicar({ taxas: atual.taxas, cotacao: { estado: "referencia", mensagem: INDISPONIVEL } });
  } finally {
    buscando = false;
  }
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  if (!buscando && Date.now() - buscadoEm > VALIDADE_MS) void buscar();
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function useCotacoes(): Cotacoes {
  return useSyncExternalStore(
    assinar,
    () => atual,
    () => INICIAL
  );
}

export function simboloDe(codigo: string): string {
  return MOEDAS.find((m) => m.codigo === codigo)?.simbolo ?? codigo;
}

/**
 * "US$ 25,00" — formato curto para listas. O formatador de cada moeda é
 * criado uma vez (`formatadorDeMoeda`): a lista do DuoFinance chama isto em
 * cada linha e no índice da busca.
 */
export function formatarMoeda(valor: number, codigo: string): string {
  const formatador = formatadorDeMoeda(codigo);
  return formatador ? formatador.format(valor) : `${simboloDe(codigo)} ${valor.toFixed(2).replace(".", ",")}`;
}
