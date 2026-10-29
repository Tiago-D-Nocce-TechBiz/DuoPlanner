import { Suspense } from "react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { MemoryPanel, MemoryPanelSkeleton } from "@/components/memory/memory-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

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

        <Card className="p-6">
          <h2 className="font-serif text-xl font-semibold">Dados da conta</h2>
          <p className="mt-1 text-sm text-muted">Como vocês aparecem no PlannerDuo.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id="accountName" label="Nome da conta" defaultValue="Minha Conta" />
            <Field
              id="partnerEmail"
              label="E-mail do parceiro(a)"
              type="email"
              placeholder="parceiro@exemplo.com"
            />
            <Field id="viajante1" label="Viajante 1" placeholder="Seu nome" />
            <Field id="viajante2" label="Viajante 2" placeholder="Nome do parceiro(a)" />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-serif text-xl font-semibold">Preferências da viagem</h2>
          <p className="mt-1 text-sm text-muted">Padrões usados ao montar buscas e finanças.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id="cidadeBase" label="Cidade base (origem)" placeholder="Ex.: Belo Horizonte" />
            <Field id="iataBase" label="Aeroporto base (IATA)" placeholder="Ex.: CNF" />
            <Field id="moeda" label="Moeda" defaultValue="Real (R$)" />
            <Field id="viajantes" label="Viajantes padrão" type="number" defaultValue="2" />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary">Cancelar</Button>
          <Button variant="primary">Salvar alterações</Button>
        </div>
      </div>
    </div>
  );
}
