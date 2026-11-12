"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { persistirAgora } from "@/lib/sync/motor";

/**
 * Remoção com "Desfazer" (5 s), para as listas sincronizadas.
 *
 * O item some da tela na hora, mas a remoção só entra na fila de
 * sincronização quando o prazo acaba. Desfazer apenas cancela: nada foi
 * enviado, então o par não recebe aviso de exclusão nem de "novo item", e o
 * registro mantém o id e a data de criação (antes, desfazer recriava o gasto).
 *
 * A remoção pendente vale mesmo se a pessoa sair antes do prazo: ao trocar de
 * tela, ocultar o app ou fechar a aba, ela é efetivada e gravada no aparelho
 * na hora. Um aviso por vez: remover outro item efetiva o anterior.
 *
 * Os ids ocultos ficam num store do módulo (`useOcultos`), para outras partes
 * da tela (ex.: os totais do DuoFinance) já desconsiderarem o item.
 */

export const DURACAO_DESFAZER_MS = 5000;

/* ------------------------- ids ocultos por lista ------------------------- */

const NENHUM: ReadonlySet<string> = new Set();
const ouvintes = new Set<() => void>();
let ocultos: ReadonlyMap<string, ReadonlySet<string>> = new Map();

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function definirOculto(lista: string, id: string | null) {
  const atual = ocultos.get(lista);
  if (id === null ? !atual : atual?.has(id) && atual.size === 1) return;
  const proximo = new Map(ocultos);
  if (id === null) proximo.delete(lista);
  else proximo.set(lista, new Set([id]));
  ocultos = proximo;
  for (const ouvinte of ouvintes) ouvinte();
}

/** Ids que a lista `lista` está escondendo (remoção aguardando o prazo). */
export function useOcultos(lista: string): ReadonlySet<string> {
  return useSyncExternalStore(
    assinar,
    () => ocultos.get(lista) ?? NENHUM,
    () => NENHUM
  );
}

/* --------------------------------- hook --------------------------------- */

export function useRemocaoAdiada<T extends { id: string }>(
  lista: string,
  efetivar: (item: T) => void,
  duracaoMs: number = DURACAO_DESFAZER_MS
) {
  const [pendente, setPendente] = useState<T | null>(null);
  const pendenteRef = useRef<T | null>(null);
  const efetivarRef = useRef(efetivar);

  useEffect(() => {
    efetivarRef.current = efetivar;
  }, [efetivar]);

  /** Efetiva a remoção pendente, se houver (não mexe no estado do aviso). */
  const efetivarPendente = useCallback(() => {
    const item = pendenteRef.current;
    if (!item) return;
    pendenteRef.current = null;
    efetivarRef.current(item);
    definirOculto(lista, null);
  }, [lista]);

  // Prazo do "Desfazer".
  useEffect(() => {
    if (!pendente) return;
    const prazo = window.setTimeout(() => {
      efetivarPendente();
      setPendente(null);
    }, duracaoMs);
    return () => window.clearTimeout(prazo);
  }, [pendente, duracaoMs, efetivarPendente]);

  // Saiu da página, ocultou o app ou trocou de tela: a remoção vale.
  useEffect(() => {
    const aoSair = () => {
      if (!pendenteRef.current) return;
      efetivarPendente();
      setPendente(null);
      persistirAgora();
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") aoSair();
    };
    window.addEventListener("pagehide", aoSair);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      window.removeEventListener("pagehide", aoSair);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      efetivarPendente();
    };
  }, [efetivarPendente]);

  const remover = useCallback(
    (item: T) => {
      efetivarPendente();
      pendenteRef.current = item;
      setPendente(item);
      definirOculto(lista, item.id);
    },
    [efetivarPendente, lista]
  );

  const desfazer = useCallback(() => {
    pendenteRef.current = null;
    setPendente(null);
    definirOculto(lista, null);
  }, [lista]);

  /** Fecha o aviso efetivando a remoção já. */
  const confirmar = useCallback(() => {
    efetivarPendente();
    setPendente(null);
  }, [efetivarPendente]);

  return { pendente, remover, desfazer, confirmar };
}
