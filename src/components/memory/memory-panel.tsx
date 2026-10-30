import { Brain, Database, History, X } from "@/components/ui/icons";
import { esquecerPreferenciaAction } from "@/app/dashboard/configuracoes/actions";
import { Card } from "@/components/ui/card";
import { loadDuoMemory } from "@/lib/memory/store";
import { formatDateBR } from "@/lib/utils";
import { TeachMemoryForm } from "./teach-memory-form";

/**
 * Painel do Agente de Contexto e Memória (Server Component).
 * Lê preferências e histórico do Supabase em tempo de requisição, por isso a
 * página o envolve em <Suspense>.
 */
export async function MemoryPanel() {
  const memory = await loadDuoMemory({ historyLimit: 5 });

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-elevated">
          <Brain className="h-5 w-5 text-heading" />
        </span>
        <div>
          <h2 className="font-serif text-xl font-semibold">Memória da IA</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            O que a IA lembra sobre a dupla. Essas preferências preenchem os
            filtros de voos e hospedagens e orientam as experiências sugeridas.
          </p>
        </div>
      </div>

      {!memory.configured ? (
        <p className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-background p-4 text-sm text-muted">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          Configure o Supabase (.env.local) e rode supabase/schema.sql para a IA
          guardar a memória da dupla.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {memory.error && (
            <p className="rounded-xl border border-border bg-background p-4 text-sm text-danger">
              Não foi possível ler a memória ({memory.error}). Rode novamente
              supabase/schema.sql para criar as tabelas da Fase 2.
            </p>
          )}

          <TeachMemoryForm />

          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-subtle">
              Preferências memorizadas
            </p>
            {memory.items.length === 0 ? (
              <p className="text-sm text-muted">
                Nada por aqui ainda. Conte à IA o orçamento, o limite de escalas
                ou os interesses da dupla.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {memory.items.map((item) => (
                  <li
                    key={item.chave}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-1 pl-3.5 pr-1 text-sm text-foreground"
                  >
                    {item.descricao}
                    <form action={esquecerPreferenciaAction}>
                      <input type="hidden" name="chave" value={item.chave} />
                      <button
                        type="submit"
                        aria-label={`Esquecer: ${item.descricao}`}
                        className="rounded-full p-1 text-subtle transition-colors hover:bg-elevated hover:text-heading"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {memory.history.length > 0 && (
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-subtle">
                <History className="h-3.5 w-3.5" />
                Histórico recente
              </p>
              <ul className="space-y-2">
                {memory.history.map((entry) => (
                  <li key={entry.id} className="flex gap-3 text-sm">
                    <span className="w-20 shrink-0 tabular-nums text-subtle">
                      {formatDateBR(entry.createdAt)}
                    </span>
                    <span className="min-w-0 text-foreground">{entry.resumo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function MemoryPanelSkeleton() {
  return (
    <Card className="p-6" aria-hidden>
      <div className="flex items-center gap-4">
        <div className="h-11 w-11 animate-pulse rounded-xl bg-elevated" />
        <div className="h-6 w-40 animate-pulse rounded bg-elevated" />
      </div>
      <div className="mt-6 h-24 w-full animate-pulse rounded-xl bg-elevated" />
      <div className="mt-6 flex gap-2">
        <div className="h-8 w-40 animate-pulse rounded-full bg-elevated" />
        <div className="h-8 w-52 animate-pulse rounded-full bg-elevated" />
      </div>
    </Card>
  );
}
