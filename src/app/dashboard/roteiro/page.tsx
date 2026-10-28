import { PageHeading } from "@/components/dashboard/page-heading";
import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Página de roteiro (estrutura base para evolução futura). */
export default function RoteiroPage() {
  return (
    <div>
      <PageHeading
        title="Roteiro"
        description="Organize a viagem dia a dia, a dois."
      />

      <div className="glass-surface flex flex-col items-center justify-center rounded-2xl p-16 text-center">
        <div className="mb-4 inline-flex rounded-xl border border-sand-border bg-sand-surface p-4">
          <CalendarDays className="h-7 w-7 text-heading" />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-heading">
          Ainda sem roteiro
        </h2>
        <p className="mt-2 max-w-sm text-sm text-foreground">
          Crie o primeiro dia da viagem e comece a adicionar atividades,
          reservas e anotações.
        </p>
        <Button variant="primary" className="mt-6">
          <Plus className="h-4 w-4" />
          Adicionar dia
        </Button>
      </div>
    </div>
  );
}
