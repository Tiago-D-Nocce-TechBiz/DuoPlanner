import { Suspense } from "react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { MemoryPanel, MemoryPanelSkeleton } from "@/components/memory/memory-panel";
import { AccountForm } from "@/components/configuracoes/account-form";

export const metadata = { title: "Configurações — PlannerDuo" };

/**
 * Configurações da conta + Memória da IA.
 * Os cards de conta são estáticos (shell); a memória lê o Supabase atrás de
 * <Suspense>.
 */
export default function ConfiguracoesPage() {
  return (
    <div className="max-w-4xl">
      <PageHeading
        title="Configurações"
        description="Gerencie a conta, as preferências de viagem e o que a IA lembra sobre a dupla."
      />

      <div className="space-y-6">
        <Suspense fallback={<MemoryPanelSkeleton />}>
          <MemoryPanel />
        </Suspense>

        <AccountForm />
      </div>
    </div>
  );
}
