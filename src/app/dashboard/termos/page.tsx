import { TermsContent } from "@/components/legal/terms-content";

export const metadata = { title: "Termos de uso & LGPD — PlannerDuo" };

/** Termos de Uso e LGPD dentro do painel. */
export default function TermosDashboardPage() {
  return (
    <div className="max-w-3xl">
      <div className="glass-surface rounded-2xl p-6 md:p-8">
        <TermsContent />
      </div>
    </div>
  );
}
