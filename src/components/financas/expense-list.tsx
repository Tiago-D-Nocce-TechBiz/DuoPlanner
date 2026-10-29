import { Database, PenLine, ReceiptText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getExpenses } from "@/lib/finance/expenses";
import { formatCurrency, formatDateBR } from "@/lib/utils";

/** Lista de despesas da dupla (Server Component dentro de <Suspense>). */
export async function ExpenseList() {
  const { configured, items, error } = await getExpenses();

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-serif text-xl font-semibold">Despesas</h2>
        {items.length > 0 && (
          <span className="text-xs text-subtle">{items.length} registradas</span>
        )}
      </div>

      {!configured ? (
        <Notice icon={Database}>
          Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local para salvar e
          listar despesas.
        </Notice>
      ) : error ? (
        <Notice icon={Database}>
          Não foi possível ler as despesas ({error}). Se você acabou de
          atualizar para a Fase 2, rode novamente o arquivo supabase/schema.sql
          no SQL Editor do Supabase.
        </Notice>
      ) : items.length === 0 ? (
        <Notice icon={ReceiptText}>
          Ainda não há despesas. Escaneie um recibo com a IA para registrar a
          primeira.
        </Notice>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-elevated">
                {item.origem === "ocr" ? (
                  <Sparkles className="h-4 w-4 text-heading" />
                ) : (
                  <PenLine className="h-4 w-4 text-heading" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-heading">
                  {item.titulo}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
                  {item.data ? formatDateBR(item.data) : "Sem data"}
                  {item.origem === "ocr" && <Badge variant="outline">IA</Badge>}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-heading">
                {formatCurrency(item.valor, item.moeda)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Notice({
  icon: Icon,
  children,
}: {
  icon: typeof Database;
  children: React.ReactNode;
}) {
  return (
    <p className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-background p-4 text-sm leading-relaxed text-muted">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
      <span>{children}</span>
    </p>
  );
}

export function ExpenseListSkeleton() {
  return (
    <Card className="p-6" aria-hidden>
      <div className="h-6 w-32 animate-pulse rounded bg-elevated" />
      <div className="mt-6 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-elevated" />
            <div className="h-4 flex-1 animate-pulse rounded bg-elevated" />
            <div className="h-4 w-20 animate-pulse rounded bg-elevated" />
          </div>
        ))}
      </div>
    </Card>
  );
}
