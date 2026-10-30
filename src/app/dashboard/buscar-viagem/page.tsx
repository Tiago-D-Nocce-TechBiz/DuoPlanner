"use client";

import { useMemo, useState } from "react";
import { Plane, Bus, LayoutGrid } from "@/components/ui/icons";
import { PageHeading } from "@/components/dashboard/page-heading";
import { FlightSearch } from "@/components/search/flight-search";
import { BusSearch } from "@/components/search/bus-search";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import type { ConciergeParse } from "@/lib/concierge";
import { readLocal, writeLocal, useMontado, STORAGE_KEYS } from "@/lib/local-store";
import { cn } from "@/lib/utils";

type Aba = "todos" | "voos" | "onibus";

const ABAS: { chave: Aba; rotulo: string; icone: typeof Plane }[] = [
  { chave: "todos", rotulo: "Todos", icone: LayoutGrid },
  { chave: "voos", rotulo: "Voos ✈️", icone: Plane },
  { chave: "onibus", rotulo: "Ônibus 🚌", icone: Bus },
];

/**
 * Buscar Passagens — abas para Todos, Voos e Ônibus.
 *
 * O pré-preenchimento vindo do Concierge (página principal) é lido APÓS a
 * montagem, dentro de useEffect — nunca no inicializador de useState. Isso
 * evita divergência entre o HTML do servidor e o do cliente (hydration
 * mismatch), que em produção aparecia como "This page couldn't load".
 */
export default function BuscarPassagensPage() {
  // `montado` é false no servidor e no 1º render do cliente (HTML idêntico →
  // sem hydration mismatch) e true após a hidratação. Via useSyncExternalStore,
  // sem setState em efeito.
  const montado = useMontado();

  // Leitura única do handoff, memoizada quando `montado` passa a true.
  const handoff = useMemo(() => {
    if (!montado) return null;
    const h = readLocal<{ dados: ConciergeParse; modo: string } | null>(
      STORAGE_KEYS.concierge,
      null
    );
    if (!h || h.modo !== "passagens") return null;
    writeLocal(STORAGE_KEYS.concierge, null); // consome o handoff
    const temIata = Boolean(h.dados.originIata && h.dados.destinationIata);
    return { dados: h.dados, aba: (temIata ? "voos" : "todos") as Aba };
  }, [montado]);

  const [abaManual, setAba] = useState<Aba | null>(null);
  const aba: Aba = abaManual ?? handoff?.aba ?? "todos";
  const preenchimento: ConciergeParse | null = handoff?.dados ?? null;

  return (
    <div className="space-y-8">
      <PageHeading
        title="Buscar Passagens"
        description="Voos (LATAM, Azul, GOL, Google Flights, Skyscanner, Decolar) e ônibus (Guanabara, Buser, UTIL, ClickBus, DeÔnibus, FlixBus, Gontijo, Cometa) em um só lugar."
      />

      {/* Abas */}
      <div
        role="tablist"
        aria-label="Tipo de passagem"
        className="inline-flex rounded-xl border border-border bg-background p-1"
      >
        {ABAS.map(({ chave, rotulo, icone: Icone }) => (
          <button
            key={chave}
            role="tab"
            aria-selected={aba === chave}
            type="button"
            onClick={() => setAba(chave)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm transition-colors",
              aba === chave
                ? "bg-elevated font-medium text-heading"
                : "text-muted hover:text-heading"
            )}
          >
            <Icone className="h-4 w-4" />
            {rotulo}
          </button>
        ))}
      </div>

      {(aba === "todos" || aba === "voos") && (
        <section className="space-y-4">
          {aba === "todos" && (
            <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-heading">
              <Plane className="h-5 w-5 text-muted" /> Voos
            </h2>
          )}
          <ErrorBoundary
            titulo="A busca de voos não carregou"
            descricao="Tente novamente ou use os links diretos das companhias."
          >
            <FlightSearch preenchimento={preenchimento} />
          </ErrorBoundary>
        </section>
      )}

      {(aba === "todos" || aba === "onibus") && (
        <section className="space-y-4">
          {aba === "todos" && (
            <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-heading">
              <Bus className="h-5 w-5 text-muted" /> Ônibus
            </h2>
          )}
          <ErrorBoundary
            titulo="A busca de ônibus não carregou"
            descricao="Tente novamente em instantes."
          >
            <BusSearch />
          </ErrorBoundary>
        </section>
      )}
    </div>
  );
}
