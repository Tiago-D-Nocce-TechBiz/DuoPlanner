"use client";

import { useEffect, useState } from "react";

/**
 * Cotações do dia no navegador (1 unidade = X reais).
 *
 * Abre com valores de REFERÊNCIA (iguais no servidor e no cliente: sem
 * hydration mismatch) e, depois de montar, busca `/api/cotacoes` (AwesomeAPI,
 * cache de 1 hora; o Service Worker guarda a última resposta para uso
 * offline). Sem rede, fica com as referências.
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

export function useCotacoes(): { taxas: Record<string, number>; cotacao: EstadoCotacao } {
  const [taxas, setTaxas] = useState<Record<string, number>>(TAXAS_REFERENCIA);
  const [cotacao, setCotacao] = useState<EstadoCotacao>({ estado: "carregando" });

  useEffect(() => {
    let ativo = true;
    fetch("/api/cotacoes", { headers: { accept: "application/json" } })
      .then((res) => res.json())
      .then((dados: RespostaCotacoes) => {
        if (!ativo) return;
        if (!dados.ok || !dados.taxas) {
          setCotacao({ estado: "referencia", mensagem: dados.mensagem ?? "Cotação ao vivo indisponível agora." });
          return;
        }
        const vivas = dados.taxas;
        setTaxas((atuais) => {
          const proximas = { ...atuais };
          for (const [codigo, taxa] of Object.entries(vivas)) {
            if (Number.isFinite(taxa) && taxa > 0) proximas[codigo] = taxa;
          }
          return proximas;
        });
        setCotacao({
          estado: "ao-vivo",
          de: dados.atualizadoDe ?? "",
          ate: dados.atualizadoAte ?? dados.atualizadoDe ?? "",
          fonte: dados.fonte ?? "AwesomeAPI",
        });
      })
      .catch(() => {
        if (ativo) setCotacao({ estado: "referencia", mensagem: "Cotação ao vivo indisponível agora." });
      });
    return () => {
      ativo = false;
    };
  }, []);

  return { taxas, cotacao };
}

export function simboloDe(codigo: string): string {
  return MOEDAS.find((m) => m.codigo === codigo)?.simbolo ?? codigo;
}

/** "US$ 25,00" — formato curto para listas. */
export function formatarMoeda(valor: number, codigo: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: codigo }).format(valor);
  } catch {
    return `${simboloDe(codigo)} ${valor.toFixed(2).replace(".", ",")}`;
  }
}
