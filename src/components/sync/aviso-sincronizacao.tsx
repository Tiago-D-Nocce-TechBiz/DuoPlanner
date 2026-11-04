"use client";

import { AlertTriangle } from "@/components/ui/icons";
import { sincronizarAgora, useStatusSync } from "@/lib/sync/motor";

/**
 * Aviso de sincronização no topo do painel (só quando há algo a dizer):
 * - "modo local": o banco ainda não tem as tabelas novas; nada se perde,
 *   as alterações esperam no aparelho;
 * - erro do servidor/sessão ao enviar.
 * Falta de conexão é mostrada pelo indicador offline (PWA).
 */
export function AvisoSincronizacao() {
  const status = useStatusSync();

  if (status.modo === "local") {
    return (
      <div role="status" className="mb-6 flex items-start gap-2.5 rounded-2xl border border-[var(--color-border-strong)] px-4 py-3 text-xs text-[var(--color-heading)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Modo local: a sincronização entre vocês dois ainda não foi ativada neste servidor. O que você fizer fica
          guardado neste aparelho{status.pendentes ? ` (${status.pendentes} alteração(ões) aguardando)` : ""} e sobe sozinho assim que ela for ativada.
        </span>
      </div>
    );
  }

  if (status.ultimoErro && status.online && !status.ultimoErro.startsWith("Sem conexão")) {
    return (
      <div role="alert" className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-[var(--color-border-strong)] px-4 py-3 text-xs text-[var(--color-heading)]">
        <span className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {status.ultimoErro}
        </span>
        {status.pendentes > 0 && (
          <button type="button" onClick={sincronizarAgora} className="shrink-0 font-semibold underline underline-offset-2 cursor-pointer">
            Tentar agora
          </button>
        )}
      </div>
    );
  }

  return null;
}
