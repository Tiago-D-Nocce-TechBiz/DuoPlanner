import type { Metadata } from "next";
import { AcoesDoRoteiro } from "@/components/roteiro/acoes-do-roteiro";
import { ListaDoRoteiro } from "@/components/roteiro/lista-do-roteiro";

export const metadata: Metadata = { title: "Roteiro — DuoPlanner" };

/**
 * Roteiro do casal.
 *
 * Página de servidor (cabeçalho estático) com duas ilhas cliente: as ações
 * do cabeçalho (modelo da planilha, importação com a Nora, novo dia) e a
 * lista de dias, que é sincronizada entre os dois (Postgres + Realtime, fila
 * offline). O diálogo de importação e o `xlsx` só são baixados quando a
 * pessoa os usa, então a rota abre com o mesmo peso de antes.
 */
export default function RoteiroPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">Roteiro</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Organizem a viagem dia a dia, juntos e em tempo real.</p>
        </div>
        <AcoesDoRoteiro />
      </div>
      <ListaDoRoteiro />
    </div>
  );
}
