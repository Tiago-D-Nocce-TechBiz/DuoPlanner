import { PageHeading } from "@/components/dashboard/page-heading";
import { ReceiptScanner } from "@/components/financas/receipt-scanner";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Users, Receipt } from "lucide-react";

/**
 * Finanças Duo.
 * Resumo de gastos + preparação da digitalização de recibos com IA.
 * Os valores de resumo são placeholders até à ligação com a base de dados.
 */
export default function FinancasPage() {
  const summary = [
    { label: "Total gasto", value: formatCurrency(0), icon: TrendingUp },
    { label: "A sua parte", value: formatCurrency(0), icon: Users },
    { label: "Despesas registadas", value: "0", icon: Receipt },
  ];

  return (
    <div>
      <PageHeading
        title="Finanças Duo"
        description="Controle os gastos da viagem a dois e divida as contas com clareza."
      />

      {/* Cartões de resumo */}
      <div className="mb-8 grid gap-5 sm:grid-cols-3">
        {summary.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">{label}</span>
              <Icon className="h-5 w-5 text-zinc-600" />
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold text-zinc-50">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Digitalização de recibos com IA (preparação) */}
      <ReceiptScanner />

      {/* Lista de despesas (vazia por agora) */}
      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="font-serif text-lg font-semibold text-zinc-100">
          Despesas
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Ainda não há despesas registadas. Digitalize um recibo ou adicione uma
          despesa manualmente para começar.
        </p>
      </div>
    </div>
  );
}
