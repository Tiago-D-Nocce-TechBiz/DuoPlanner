"use client";

import { useMemo, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { AlertTriangle } from "@/components/ui/icons";
import { logoutAction } from "@/app/(auth)/actions";
import { limparDadosLocais } from "@/lib/privacidade/limpeza-local";
import { obterSupabase } from "@/lib/supabase/client-sob-demanda";
import { lerDadosLegados, totalLegado } from "@/lib/sync/legado";

/**
 * Confirmação de saída da conta.
 *
 * Sair limpa TUDO o que é do usuário neste navegador (`pd-*` no
 * localStorage/sessionStorage e os caches do Service Worker): a próxima
 * pessoa no mesmo aparelho não vê finanças, roteiro nem notificações.
 *
 * Antes de apagar, avisa quando há dados que só existem aqui — os salvos
 * antes da sincronização (ainda não importados) ou alterações feitas offline
 * que ainda não chegaram ao servidor (`pendenciasExtras`).
 */
export function SairModal({
  aberto,
  onFechar,
  pendenciasExtras = 0,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** Alterações na fila de sincronização ainda não enviadas. */
  pendenciasExtras?: number;
}) {
  const [saindo, startSaida] = useTransition();

  // Lido só quando o modal abre (após um clique): sem risco de hydration mismatch.
  const legados = useMemo(() => {
    if (!aberto || typeof window === "undefined") return 0;
    try {
      return totalLegado(lerDadosLegados(window.localStorage));
    } catch {
      return 0;
    }
  }, [aberto]);
  const soNesteAparelho = legados + pendenciasExtras;

  function sair() {
    startSaida(async () => {
      await limparDadosLocais();
      try {
        // Revoga o refresh token no servidor e redireciona para o início.
        // Só volta aqui se o servidor não conseguiu (sucesso redireciona).
        const resultado = await logoutAction();
        if (!resultado.success) await sairSoNesteNavegador();
      } catch {
        // Sem rede.
        await sairSoNesteNavegador();
      }
    });
  }

  /** Encerra a sessão só neste navegador e sai mesmo assim. */
  async function sairSoNesteNavegador() {
    try {
      const supabase = await obterSupabase();
      await supabase?.auth.signOut({ scope: "local" });
    } catch {
      // ignora: os cookies serão recusados pelo servidor quando expirarem
    }
    // Navegação completa (não o router): descarta todo o estado em memória
    // da conta que saiu; `replace` impede voltar ao painel pelo histórico.
    window.location.replace(`${window.location.origin}/`);
  }

  return (
    <Modal open={aberto} onClose={saindo ? () => {} : onFechar} title="Deseja realmente encerrar a sessão?">
      <p className="text-sm text-[var(--color-muted)]">
        Sua sessão será encerrada e os dados da conta guardados neste navegador serão apagados
        deste aparelho. Tudo o que já está sincronizado continua na sua conta.
      </p>

      {soNesteAparelho > 0 && (
        <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-[var(--color-border-strong)] p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" />
          <p className="text-xs text-[var(--color-heading)]">
            {soNesteAparelho === 1
              ? "Há 1 item que existe só neste aparelho"
              : `Há ${soNesteAparelho} itens que existem só neste aparelho`}{" "}
            (ainda não enviados para a nuvem). Se sair agora, eles serão apagados.
            {legados > 0 ? " Importe-os pelo aviso no topo do painel antes de sair." : " Conecte-se à internet e aguarde a sincronização."}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onFechar}
          disabled={saindo}
          className="px-4 py-2 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer disabled:opacity-60"
        >
          Permanecer conectado
        </button>
        <button
          type="button"
          onClick={sair}
          disabled={saindo}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
        >
          {saindo ? "Encerrando…" : soNesteAparelho > 0 ? "Sair e apagar deste aparelho" : "Sim, encerrar e ir ao início"}
        </button>
      </div>
    </Modal>
  );
}
