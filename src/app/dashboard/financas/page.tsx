import { PageHeading } from "@/components/dashboard/page-heading";
import { ReceiptScanner } from "@/components/financas/receipt-scanner";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Users, Receipt } from "lucide-react";

/**
 * Finanças Duo.
 * Resumo de gastos (em Reais) + captura de despesas com IA.
 * Os valores de resumo são placeholders até à ligação com a base de dados.
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

      {/* Cartões de resumo */}
      <div className="mb-8 grid gap-5 sm:grid-cols-3">
        {summary.map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-surface rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#57534E]">{label}</span>
              <Icon className="h-5 w-5 text-[#A8A29E]" />
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold text-[#1C1917]">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Captura de despesas com IA */}
      <ReceiptScanner />

      {/* Lista de despesas (vazia por agora) */}
      <div className="glass-surface mt-8 rounded-2xl p-6">
        <h2 className="font-serif text-xl font-semibold text-[#1C1917]">
          Despesas
        </h2>
        <p className="mt-2 text-sm text-[#57534E]">
          Ainda não há despesas registradas. Escaneie uma nota ou adicione um
          lançamento manual para começar.
        </p>
      </div>
    </div>
  );
}
