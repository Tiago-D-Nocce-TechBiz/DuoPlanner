import { PageHeading } from "@/components/dashboard/page-heading";
import { ReceiptScanner } from "@/components/financas/receipt-scanner";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Users, Receipt } from "lucide-react";

/**
 * Finanças Duo.
 * Resumo de gastos (em Reais) + captura de despesas com IA.
 * Os valores de resumo são placeholders até à ligação com o banco de dados.
 */
export default function FinancasPage() {
  const summary = [
    { label: "Total gasto", value: formatCurrency(0), icon: TrendingUp },
    { label: "A sua parte", value: formatCurrency(0), icon: Users },
    { label: "Despesas registradas", value: "0", icon: Receipt },
  ];

  return (
    <div>
      <PageHeading
        title="Finanças Duo"
        description="Controle os gastos da viagem a dois e divida as contas com clareza."
      />

      <div className="mb-8 grid gap-5 sm:grid-cols-3">
        {summary.map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-surface rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{label}</span>
              <Icon className="h-5 w-5 text-foreground/60" />
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold text-heading">
              {value}
            </p>
          </div>
        ))}
      </div>

      <ReceiptScanner />

      <div className="glass-surface mt-8 rounded-2xl p-6">
        <h2 className="font-serif text-xl font-semibold text-heading">
          Despesas
        </h2>
        <p className="mt-2 text-sm text-foreground">
          Ainda não há despesas registradas. Escaneie uma nota ou adicione um
          lançamento manual para começar.
        </p>
      </div>
    </div>
  );
}
