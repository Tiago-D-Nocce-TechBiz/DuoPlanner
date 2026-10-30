"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Wallet, FileText, Map, CheckCircle2 } from "@/components/ui/icons";
import {
  useNotificacoes,
  marcarComoLida,
  marcarTodasComoLidas,
  limparNotificacoes,
  type TipoNotificacao,
} from "@/lib/notifications/store";
import { cn } from "@/lib/utils";

const ICONE: Record<TipoNotificacao, typeof Bell> = {
  financas: Wallet,
  documento: FileText,
  roteiro: Map,
  geral: Bell,
};

/** Tempo relativo curto em PT-BR (ex.: "há 5 min", "ontem"). */
function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/**
 * Sino de notificações do cabeçalho. Mostra um contador de não lidas e abre
 * um painel com os avisos de quando o parceiro(a) vincula finanças, documentos
 * ou itens de roteiro ao espaço compartilhado.
 */
export function NotificationBell() {
  const router = useRouter();
  const notificacoes = useNotificacoes();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [aberto]);

  function abrirItem(id: string, href?: string) {
    marcarComoLida(id);
    if (href) {
      setAberto(false);
      router.push(href);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title="Notificações"
        aria-label={naoLidas > 0 ? `Notificações (${naoLidas} não lidas)` : "Notificações"}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full glass-panel text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
      >
        <Bell className="h-4 w-4" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[90vw] rounded-2xl border border-[var(--color-border)] bg-[var(--color-elevated)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--color-heading)]">Notificações</span>
            {notificacoes.length > 0 && (
              <button
                type="button"
                onClick={() => marcarTodasComoLidas()}
                className="text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-heading)] cursor-pointer"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notificacoes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="h-6 w-6 text-[var(--color-subtle)]" />
                <p className="text-sm text-[var(--color-muted)]">Nenhuma notificação por aqui.</p>
                <p className="text-xs text-[var(--color-subtle)]">
                  Você será avisado quando o parceiro(a) vincular finanças, documentos ou itens do roteiro.
                </p>
              </div>
            ) : (
              notificacoes.map((n) => {
                const Icone = ICONE[n.tipo];
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => abrirItem(n.id, n.href)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5",
                      !n.lida && "bg-[var(--color-card)]"
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-heading)]">
                      <Icone className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-[var(--color-heading)]">{n.titulo}</span>
                        {!n.lida && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-danger)]" />}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-muted)]">{n.descricao}</span>
                      <span className="mt-1 block text-[10px] text-[var(--color-subtle)]">
                        {n.origem ? `${n.origem} • ` : ""}{tempoRelativo(n.criadaEm)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {notificacoes.length > 0 && (
            <div className="border-t border-[var(--color-border)] px-4 py-2.5">
              <button
                type="button"
                onClick={() => limparNotificacoes()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-heading)] cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Limpar notificações
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
