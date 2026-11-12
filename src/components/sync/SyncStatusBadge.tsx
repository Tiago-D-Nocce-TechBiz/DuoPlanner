"use client";

import { useEffect, useState } from "react";
import { CloudCheck, CloudOff, CloudUp, Loader2, Smartphone, type AppIcon } from "@/components/ui/icons";
import { useOnline } from "@/lib/pwa/use-online";
import { sincronizarAgora, useStatusSync } from "@/lib/sync/motor";
import { detalheDoEstado, estadoVisivel, ROTULO_CURTO, ROTULO_ESTADO, type EstadoVisivel } from "@/lib/sync/status-visivel";

/**
 * Selo de sincronização do cabeçalho: "Sincronizado na nuvem", "Salvando
 * alterações…" e "Offline (Salvo neste aparelho)", além do modo local e do
 * carregamento inicial. Some quando não há sessão sincronizando.
 *
 * Tocar nele envia a fila na hora (útil depois de voltar a conexão). Em telas
 * estreitas fica só o ícone; o texto completo está no nome acessível e na dica.
 */

/** Espera antes de mostrar "Salvando…": o envio costuma levar milissegundos. */
export const ESPERA_SALVANDO_MS = 400;

const ICONE: Record<EstadoVisivel, AppIcon> = {
  nuvem: CloudCheck,
  salvando: CloudUp,
  offline: CloudOff,
  local: Smartphone,
  conectando: Loader2,
};

const COR: Record<EstadoVisivel, string> = {
  nuvem: "text-[var(--color-muted)]",
  salvando: "text-[var(--color-heading)]",
  offline: "text-[var(--color-danger)]",
  local: "text-[var(--color-heading)]",
  conectando: "text-[var(--color-muted)]",
};

export function SyncStatusBadge() {
  const status = useStatusSync();
  const online = useOnline();
  // Ciclo de pendência que já passou da espera (o motor numera cada ciclo).
  const [cicloVisivel, setCicloVisivel] = useState<number | null>(null);

  useEffect(() => {
    const ciclo = status.pendenteDesde;
    if (ciclo === null) return;
    const espera = window.setTimeout(() => setCicloVisivel(ciclo), ESPERA_SALVANDO_MS);
    return () => window.clearTimeout(espera);
  }, [status.pendenteDesde]);

  const pendenteHaTempo = status.pendenteDesde !== null && cicloVisivel === status.pendenteDesde;
  const estado = estadoVisivel(status, online, pendenteHaTempo);
  if (!estado) return null;

  const Icone = ICONE[estado];
  const rotulo = ROTULO_ESTADO[estado];
  const detalhe = detalheDoEstado(estado, status, online);
  const curto = ROTULO_CURTO[estado];
  const acionavel = estado === "offline" || estado === "salvando" || status.pendentes > 0;
  // Leitor de tela: anuncia ficar offline, o modo local e a volta à nuvem,
  // não cada "Salvando…" de um toque (o texto continua o mesmo enquanto salva).
  const anuncio = estado === "salvando" ? ROTULO_ESTADO.nuvem : estado === "conectando" ? "" : rotulo;

  return (
    <>
      <button
        type="button"
        data-sync-badge
        data-estado={estado}
        onClick={acionavel ? sincronizarAgora : undefined}
        aria-label={`${rotulo}. ${detalhe}`}
        title={detalhe}
        className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold glass-panel transition-colors ${
          acionavel ? "cursor-pointer hover:bg-black/5 dark:hover:bg-white/10" : "cursor-default"
        }`}
      >
        <Icone
          className={`h-4 w-4 ${COR[estado]} ${
            estado === "conectando" ? "animate-spin motion-reduce:animate-none" : estado === "salvando" ? "motion-safe:animate-pulse" : ""
          }`}
        />
        {curto && <span className={`sm:hidden ${COR[estado]}`}>{curto}</span>}
        <span className="hidden sm:inline text-[var(--color-heading)]">{rotulo}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </span>
    </>
  );
}
