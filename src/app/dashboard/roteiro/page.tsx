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

      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-16 text-center">
        <div className="mb-4 inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <CalendarDays className="h-7 w-7 text-accent" />
        </div>
        <h2 className="font-serif text-xl font-semibold text-zinc-100">
          Ainda sem roteiro
        </h2>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          Crie o primeiro dia da viagem e comece a adicionar atividades,
          reservas e notas.
        </p>
        <Button variant="primary" className="mt-6">
          <Plus className="h-4 w-4" />
          Adicionar dia
        </Button>
      </div>
    </div>
  );
}
