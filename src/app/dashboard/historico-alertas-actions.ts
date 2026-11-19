"use server";

import { z } from "zod";
import { ErroAcao, withAuthAction } from "@/lib/acoes/com-sessao";
import { lerHistoricoDoAlerta } from "@/lib/alertas/historico-leitura";
import type { PontoPreco } from "@/lib/alertas/historico";

/**
 * Série de preços de um Alerta de Preço (o gráfico da tela de Alertas).
 * Sessão por `getClaims()` (`withAuthAction`), entrada validada e leitura com
 * colunas explícitas, pela RLS: só o que é do espaço do casal.
 */
export const historicoDoAlerta = withAuthAction(
  "historicoDoAlerta",
  z.object({ alertaId: z.uuid("Alerta inválido.") }),
  async ({ alertaId }, { sessao }): Promise<{ pontos: PontoPreco[] }> => {
    const pontos = await lerHistoricoDoAlerta(sessao.supabase, alertaId);
    if (pontos === "indisponivel") throw new ErroAcao("INDISPONIVEL", "O histórico de preços ainda não está ativo neste servidor.");
    return { pontos };
  }
);
