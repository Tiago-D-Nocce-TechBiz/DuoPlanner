"use client";

import { useEffect } from "react";
import { obterContextoSincronizacao, sincronizarOperacoes } from "@/app/dashboard/sincronizacao-actions";
import { falhaTransitoria } from "@/lib/acoes/resultado";
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

function abrirComCopiaGuardada() {
  const guardado = lerContextoGuardado();
  if (guardado) iniciarSincronizacao(guardado, { enviar });
}

async function carregarContexto(): Promise<void> {
  let resposta: Awaited<ReturnType<typeof obterContextoSincronizacao>>;
  try {
    resposta = await obterContextoSincronizacao();
  } catch {
    // Sem rede: abre com a última cópia deste aparelho, se houver.
    return abrirComCopiaGuardada();
  }
  if (resposta.success) {
    try {
      window.localStorage.setItem(CHAVE_CONTEXTO, JSON.stringify(resposta.data));
    } catch {
      // storage indisponível: segue só em memória
    }
    iniciarSincronizacao(resposta.data, { enviar });
    return;
  }
  // Servidor instável é como estar offline; sem sessão ou sem Supabase não há
  // nada a sincronizar (o proxy cuida do login).
  if (falhaTransitoria(resposta)) abrirComCopiaGuardada();
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
