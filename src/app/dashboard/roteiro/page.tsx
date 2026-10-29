import { CalendarDays, Plus } from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Página de roteiro (estrutura base para evolução futura). */
export default function RoteiroPage() {
  return (
    <div>
      <PageHeading title="Roteiro" description="Organize a viagem dia a dia, a dois." />

      <Card className="flex flex-col items-center justify-center p-16 text-center">
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-elevated">
          <CalendarDays className="h-6 w-6 text-heading" />
        </span>
        <h2 className="font-serif text-2xl font-semibold">Ainda sem roteiro</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Crie o primeiro dia da viagem e comece a adicionar atividades,
          reservas e anotações.
        </p>
        <Button variant="primary" className="mt-6">
          <Plus className="h-4 w-4" />
          Adicionar dia
        </Button>
      </Card>
    </div>
  );
}
