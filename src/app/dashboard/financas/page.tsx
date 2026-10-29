import { Suspense } from "react";
import { PageHeading } from "@/components/dashboard/page-heading";
import {
  ExpenseList,
  ExpenseListSkeleton,
} from "@/components/financas/expense-list";
import {
  FinanceSummary,
  FinanceSummarySkeleton,
} from "@/components/financas/finance-summary";
import { ReceiptScanner } from "@/components/financas/receipt-scanner";

export const metadata = { title: "Finanças Duo — PlannerDuo" };

/**
 * Finanças Duo (Premium Dark).
 *
 * Cabeçalho e scanner fazem parte do shell estático; resumo e lista leem o
 * Supabase em tempo de requisição, cada um atrás do próprio <Suspense>
 * (padrão do Cache Components). Depois de um OCR, a Server Action chama
 * refresh() e esses dois blocos são renderizados de novo.
 */
export default function FinancasPage() {
  return (
    <div className="space-y-6">
      <PageHeading
        title="Finanças Duo"
        description="Controle os gastos da viagem a dois e divida as contas com clareza. Recibos escaneados entram sozinhos na lista."
      />

      <Suspense fallback={<FinanceSummarySkeleton />}>
        <FinanceSummary />
      </Suspense>

      <ReceiptScanner />

      <Suspense fallback={<ExpenseListSkeleton />}>
        <ExpenseList />
      </Suspense>
    </div>
  );
}
