import { TermsContent } from "@/components/legal/terms-content";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Termos de uso & LGPD — PlannerDuo" };

/** Termos de Uso e LGPD dentro do painel. */
export default function TermosDashboardPage() {
  return (
    <div className="max-w-3xl">
      <Card className="p-6 md:p-8">
        <TermsContent />
      </Card>
    </div>
  );
}
