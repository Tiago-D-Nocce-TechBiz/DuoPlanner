"use client";

import { Suspense, use } from "react";
import { Clock, Compass, Lightbulb, Sparkles, Wallet } from "@/components/ui/icons";
import type { LocalGemsResult } from "@/app/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/**
 * Etapa "Experiências Ocultas": recebe a promise da Server Action
 * `sugerirExperienciasLocais` (criada no submit da busca) e a resolve com
 * `use()` dentro de <Suspense>, sem efeitos colaterais no render.
 */
export function LocalGems({ promise }: { promise: Promise<LocalGemsResult> }) {
  return (
    <section aria-label="Experiências ocultas no destino">
      <Suspense fallback={<GemsSkeleton />}>
        <GemsContent promise={promise} />
      </Suspense>
    </section>
  );
}

function GemsHeader({ destino }: { destino?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Compass className="h-5 w-5 text-muted" />
      <h2 className="font-serif text-2xl font-semibold">
        Experiências ocultas{destino ? ` em ${destino}` : ""}
      </h2>
    </div>
  );
}

function GemsContent({ promise }: { promise: Promise<LocalGemsResult> }) {
  const result = use(promise);

  if (!result.ok) {
    return (
      <>
        <GemsHeader destino={result.destino} />
        <Card className="p-5 text-sm text-muted">
          Sugestões da IA indisponíveis: {result.message}
        </Card>
      </>
    );
  }

  return (
    <>
      <GemsHeader destino={result.destino} />
      {result.contexto.length > 0 && (
        <p className="mb-4 text-xs text-subtle">
          Considerando a memória da dupla: {result.contexto.join(" · ")}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {result.experiencias.map((gem) => (
          <Card key={gem.nome} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-serif text-lg font-semibold leading-snug text-heading">
                {gem.nome}
              </h3>
              <Badge variant={gem.custo === "gratuito" ? "accent" : "neutral"}>
                {gem.custo === "gratuito" ? "Grátis" : "Baixo custo"}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{gem.descricao}</p>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted">
              <Detail icon={Wallet} label="Custo estimado">{gem.custo_estimado}</Detail>
              <Detail icon={Clock} label="Melhor momento">{gem.melhor_momento}</Detail>
              <Detail icon={Lightbulb} label="Dica local">{gem.dica_local}</Detail>
            </dl>
          </Card>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
        <Sparkles className="h-3.5 w-3.5" />
        Sugestões geradas por IA. Confira horários e regras antes de ir.
      </p>
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <dt className="sr-only">{label}</dt>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <dd>{children}</dd>
    </div>
  );
}

function GemsSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-4 flex items-center gap-2 text-sm text-muted">
        <Sparkles className="h-4 w-4 animate-pulse" />
        A IA está garimpando 3 experiências gratuitas ou baratas no destino…
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-5">
            <div className="h-5 w-2/3 animate-pulse rounded bg-elevated" />
            <div className="mt-4 h-3 w-full animate-pulse rounded bg-elevated" />
            <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-elevated" />
            <div className="mt-6 h-3 w-1/2 animate-pulse rounded bg-elevated" />
          </Card>
        ))}
      </div>
    </div>
  );
}
