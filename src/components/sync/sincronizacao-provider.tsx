"use client";

import { useEffect } from "react";
import { obterContextoSincronizacao, sincronizarOperacoes } from "@/app/dashboard/sincronizacao-actions";
import type { ContextoSincronizacao } from "@/lib/sync/contexto";
import { encerrarSincronizacao, iniciarSincronizacao, type EnviadorLote } from "@/lib/sync/motor";
import { BannerImportacao } from "./banner-importacao";

const enviar: EnviadorLote = (lote) => sincronizarOperacoes(lote);

/**
 * Liga a sincronização do casal no painel.
 *
 * Busca o contexto (sessão, espaço, integrantes, acordo) no servidor e inicia
 * o motor. Sem rede, usa o último contexto guardado neste aparelho (apagado
 * no logout, como todo `pd-*`) — o painel abre offline com a última cópia.
 */

const CHAVE_CONTEXTO = "pd-sessao-contexto";

function lerContextoGuardado(): ContextoSincronizacao | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE_CONTEXTO);
    return bruto ? (JSON.parse(bruto) as ContextoSincronizacao) : null;
  } catch {
    return null;
  }
}

async function carregarContexto(): Promise<void> {
  try {
    const resposta = await obterContextoSincronizacao();
    if (resposta.ok) {
      try {
        window.localStorage.setItem(CHAVE_CONTEXTO, JSON.stringify(resposta.contexto));
      } catch {
        // storage indisponível: segue só em memória
      }
      iniciarSincronizacao(resposta.contexto, { enviar });
      return;
    }
    // Sem sessão ou sem Supabase: nada a sincronizar (o proxy cuida do login).
  } catch {
    // Sem rede: abre com a última cópia deste aparelho, se houver.
    const guardado = lerContextoGuardado();
    if (guardado) iniciarSincronizacao(guardado, { enviar });
  }
}

export function SincronizacaoProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void carregarContexto();
    // Ao voltar para o app, o par pode ter entrado no espaço ou mudado o perfil.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void carregarContexto();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      encerrarSincronizacao();
    };
  }, []);

  return (
    <>
      <BannerImportacao />
      {children}
    </>
  );
}
