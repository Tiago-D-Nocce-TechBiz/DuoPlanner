"use client";

/**
 * Store de despesas das Finanças Duo, persistida em localStorage.
 *
 * Antes, a página de Finanças mantinha as despesas apenas em `useState`, o que
 * impedia a Nora (agente de IA) de lançar um gasto que a página enxergasse.
 * Este store centraliza a lista em localStorage e notifica assinantes (via
 * `useSyncExternalStore`), de modo que QUALQUER parte do app — a página de
 * Finanças ou a Nora — possa ler e escrever, e todas as telas se atualizam.
 *
 * Mantém a mesma modelagem da página (ItemDespesa/Escopo/Categoria) e a mesma
 * regra de privacidade: o que não é reconhecido entra como pessoal_privado.
 */

import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "@/lib/local-store";

export type Categoria =
  | "Passagens & Transporte"
  | "Hospedagem"
  | "Alimentação & Gastronomia"
  | "Passeios & Lazer"
  | "Gasto Pessoal (Fora da Viagem)";

export type Escopo = "viagem_compartilhado" | "pessoal_privado";

export interface ItemDespesa {
  id: string;
  data: string; // "dd/mm/aaaa" (locale pt-BR)
  estabelecimento: string;
  valor: number;
  categoriaDestino: Categoria;
  escopo: Escopo;
  origem: string; // "Manual" | "Importado" | "Nora"
}

const CHAVE = "pd-financas-despesas";
const EVENTO = "pd-financas-despesas-change";

export function idAleatorio(): string {
  return Math.random().toString(36).substring(2, 9);
}

/** Classifica um item por palavras-chave (privado por padrão, nunca vaza). */
export function classificarItemAutomaticamente(
  titulo: string,
  valor: number,
  data: string,
  origem = "Importado"
): ItemDespesa {
  const t = titulo.toLowerCase();
  const base = { id: idAleatorio(), data, estabelecimento: titulo, valor, origem };

  const transporte = [
    "latam", "azul", "gol", "voeazul", "voegol", "decolar", "skyscanner",
    "buser", "guanabara", "util", "clickbus", "flixbus", "deonibus", "gontijo",
    "cometa", "viacao", "viação", "rodoviaria", "rodoviária",
    "uber", "99", "99app", "cabify", "pedagio", "pedágio", "sem parar", "conectcar",
    "posto", "combustivel", "combustível", "shell", "ipiranga", "petrobras",
  ];
  const hospedagem = [
    "airbnb", "booking", "hoteis", "hotéis", "hotel", "pousada", "resort",
    "hospedagem", "hostel", "vrbo", "expedia", "trivago", "flat",
  ];
  const lazer = [
    "ingresso", "ingressos", "parque", "tour", "passeio", "museu", "cinema",
    "show", "balada", "ticket", "beach club", "mergulho", "escuna", "trilha",
  ];
  const alimentacao = [
    "restaurante", "bar ", "boteco", "praia", "quiosque", "padaria",
    "lanchonete", "ifood", "mercado", "supermercado", "cafe", "café", "almoço",
    "almoco", "jantar", "janta", "lanche", "pizzaria", "hamburgueria",
    "churrascaria", "sorveteria", "food",
  ];
  const pessoal = [
    "academia", "farmacia", "farmácia", "drogaria", "assinatura", "streaming",
    "mensalidade", "consulta", "plano de saude",
  ];

  const casa = (lista: string[]) => lista.some((k) => t.includes(k));

  if (casa(pessoal)) return { ...base, categoriaDestino: "Gasto Pessoal (Fora da Viagem)", escopo: "pessoal_privado" };
  if (casa(transporte)) return { ...base, categoriaDestino: "Passagens & Transporte", escopo: "viagem_compartilhado" };
  if (casa(hospedagem)) return { ...base, categoriaDestino: "Hospedagem", escopo: "viagem_compartilhado" };
  if (casa(lazer)) return { ...base, categoriaDestino: "Passeios & Lazer", escopo: "viagem_compartilhado" };
  if (casa(alimentacao)) return { ...base, categoriaDestino: "Alimentação & Gastronomia", escopo: "viagem_compartilhado" };
  return { ...base, categoriaDestino: "Gasto Pessoal (Fora da Viagem)", escopo: "pessoal_privado" };
}

function emitir() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTO));
  }
}

/** Lê a lista atual de despesas. */
export function getDespesas(): ItemDespesa[] {
  return readLocal<ItemDespesa[]>(CHAVE, []);
}

/** Substitui a lista inteira (usado pela página ao confirmar triagem). */
export function setDespesas(lista: ItemDespesa[]): void {
  writeLocal(CHAVE, lista);
  emitir();
}

/** Adiciona uma despesa no topo da lista e devolve o item criado. */
export function adicionarDespesa(item: ItemDespesa): ItemDespesa {
  const atual = getDespesas();
  setDespesas([item, ...atual]);
  return item;
}

/** Resumo financeiro (compartilhado, metade, pessoal) + agregados. */
export interface ResumoFinancas {
  totalCompartilhado: number;
  metade: number;
  totalPrivado: number;
  qtdCompartilhado: number;
  qtdPrivado: number;
  porCategoria: { categoria: Categoria; total: number }[];
}

export function resumirDespesas(lista: ItemDespesa[] = getDespesas()): ResumoFinancas {
  const compartilhados = lista.filter((d) => d.escopo === "viagem_compartilhado");
  const privados = lista.filter((d) => d.escopo === "pessoal_privado");
  const totalCompartilhado = compartilhados.reduce((a, i) => a + i.valor, 0);
  const totalPrivado = privados.reduce((a, i) => a + i.valor, 0);

  const mapa = new Map<Categoria, number>();
  for (const d of compartilhados) {
    mapa.set(d.categoriaDestino, (mapa.get(d.categoriaDestino) ?? 0) + d.valor);
  }
  const porCategoria = [...mapa.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);

  return {
    totalCompartilhado,
    metade: totalCompartilhado / 2,
    totalPrivado,
    qtdCompartilhado: compartilhados.length,
    qtdPrivado: privados.length,
    porCategoria,
  };
}

/* -------------------------- Hook reativo (React) -------------------------- */

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(EVENTO, handler);
  window.addEventListener("storage", handler); // sincroniza entre abas
  return () => {
    window.removeEventListener(EVENTO, handler);
    window.removeEventListener("storage", handler);
  };
}

// Cache do snapshot para o useSyncExternalStore (precisa ser referência estável
// enquanto os dados não mudam, senão o React entra em loop).
let cacheBruto = "";
let cacheLista: ItemDespesa[] = [];

function getSnapshot(): ItemDespesa[] {
  if (typeof window === "undefined") return cacheLista;
  const bruto = window.localStorage.getItem(CHAVE) ?? "[]";
  if (bruto !== cacheBruto) {
    cacheBruto = bruto;
    try {
      cacheLista = JSON.parse(bruto) as ItemDespesa[];
    } catch {
      cacheLista = [];
    }
  }
  return cacheLista;
}

function getServerSnapshot(): ItemDespesa[] {
  return [];
}

/** Hook: lista reativa de despesas (atualiza quando a Nora ou a página mudam). */
export function useDespesas(): ItemDespesa[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
