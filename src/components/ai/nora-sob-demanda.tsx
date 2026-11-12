"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useNora } from "./nora-provider";

/**
 * Painel da Nora carregado sob demanda.
 *
 * O painel (conversa, cérebro de regras, ações e ditado por voz) não entra no
 * carregamento inicial do painel: o código é pré-buscado quando o navegador
 * fica ocioso, ou quando o ponteiro/foco chega no botão "Perguntar à Nora", e
 * o componente só monta na primeira vez que a Nora é aberta. Depois disso
 * continua montado (a conversa sobrevive a abrir e fechar).
 */

const carregar = () => import("./nora-drawer");

const NoraDrawer = dynamic(() => carregar().then((m) => m.NoraDrawer), { ssr: false, loading: () => null });

/** Pré-busca o código do painel (idempotente: o navegador reaproveita o chunk). */
export function preCarregarNora() {
  void carregar().catch(() => {
    // Offline na primeira visita: tenta de novo ao abrir.
  });
}

function economizaDados(): boolean {
  const conexao = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conexao?.saveData === true;
}

export function NoraSobDemanda() {
  const { aberta } = useNora();
  const [montar, setMontar] = useState(false);
  // Primeira abertura: monta (e não desmonta mais).
  if (aberta && !montar) setMontar(true);

  useEffect(() => {
    // Com "economia de dados" ligada, só baixa quando a pessoa chamar a Nora.
    if (economizaDados()) return;
    if (typeof window.requestIdleCallback === "function") {
      const ocioso = window.requestIdleCallback(preCarregarNora, { timeout: 5000 });
      return () => window.cancelIdleCallback(ocioso);
    }
    // Safari ainda não tem requestIdleCallback.
    const atraso = window.setTimeout(preCarregarNora, 3000);
    return () => window.clearTimeout(atraso);
  }, []);

  return montar ? <NoraDrawer /> : null;
}
