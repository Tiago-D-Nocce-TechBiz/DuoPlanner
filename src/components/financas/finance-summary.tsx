import { Receipt, TrendingUp, Users } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { getExpenses, summarizeExpenses } from "@/lib/finance/expenses";
import { formatCurrency } from "@/lib/utils";

/** Três cards de resumo (Server Component; lê o Supabase dentro de <Suspense>). */
export async function FinanceSummary() {
  const { items } = await getExpenses();
  const summary = summarizeExpenses(items);

  const cards = [
    {
      label: "Total gasto",
      value: formatCurrency(summary.totalBrl),
      hint: summary.otherCurrencies.length
        ? `+ ${summary.otherCurrencies
            .map(({ currency, total }) => formatCurrency(total, currency))
            .join(" · ")}`
        : "Em Reais",
      icon: TrendingUp,
    },
    {
      label: "Por pessoa",
      value: formatCurrency(summary.perPerson),
      hint: "Divisão igual para a dupla",
      icon: Users,
    },
    {
      label: "Despesas",
      value: String(summary.count),
      hint: summary.viaIa
        ? `${summary.viaIa} lida${summary.viaIa > 1 ? "s" : ""} pela IA`
        : "Nenhuma lida pela IA ainda",
      icon: Receipt,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map(({ label, value, hint, icon: Icon }) => (
        <Card key={label} className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{label}</span>
            <Icon className="h-4 w-4 text-subtle" />
          </div>
          <p className="mt-4 font-serif text-3xl font-semibold tabular-nums text-heading">
            {value}
          </p>
          <p className="mt-1 text-xs text-subtle">{hint}</p>
        </Card>
      ))}
    </div>
  );
}

export function FinanceSummarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-6">
          <div className="h-4 w-24 animate-pulse rounded bg-elevated" />
          <div className="mt-5 h-8 w-36 animate-pulse rounded bg-elevated" />
          <div className="mt-3 h-3 w-28 animate-pulse rounded bg-elevated" />
        </Card>
      ))}
    </div>
  );
}
