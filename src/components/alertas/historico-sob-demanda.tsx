"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

/**
 * Botão "Ver histórico de preços" de um alerta. O gráfico, o resumo e a
 * chamada ao servidor só são baixados no primeiro clique.
 */
const HistoricoDoAlerta = dynamic(() => import("./historico-do-alerta").then((m) => m.HistoricoDoAlerta), {
  ssr: false,
  loading: () => (
    <p role="status" className="mt-3 text-xs text-[var(--color-muted)]">
      Carregando o histórico…
    </p>
  ),
});

export function HistoricoSobDemanda({ alertaId, precoAlvo }: { alertaId: string; precoAlvo: number | null }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="px-3 py-2 rounded-xl text-xs font-semibold glass-panel cursor-pointer"
      >
        {aberto ? "Ocultar histórico" : "Ver histórico de preços"}
      </button>
      {aberto && <HistoricoDoAlerta alertaId={alertaId} precoAlvo={precoAlvo} />}
    </div>
  );
}
