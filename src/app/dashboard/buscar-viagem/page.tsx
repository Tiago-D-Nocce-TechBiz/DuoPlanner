"use client";

import { useState } from "react";
import { Plane, Bus, LayoutGrid } from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { FlightSearch } from "@/components/search/flight-search";
import { BusSearch } from "@/components/search/bus-search";
import { ConciergeBox } from "@/components/search/concierge-box";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import type { ConciergeParse } from "@/lib/concierge";
import { readLocal, writeLocal, STORAGE_KEYS } from "@/lib/local-store";
import { cn } from "@/lib/utils";

/** Lê (uma vez) o pré-preenchimento vindo do Concierge da página principal. */
function lerHandoffInicial(): { dados: ConciergeParse; aba: Aba } | null {
  const h = readLocal<{ dados: ConciergeParse; modo: string } | null>(
    STORAGE_KEYS.concierge,
    null
  );
  if (!h || h.modo !== "passagens") return null;
  // Consome o handoff para não reaplicar em recarregamentos futuros.
  writeLocal(STORAGE_KEYS.concierge, null);
  const temIata = Boolean(h.dados.originIata && h.dados.destinationIata);
  return { dados: h.dados, aba: temIata ? "voos" : "todos" };
}

type Aba = "todos" | "voos" | "onibus";

const ABAS: { chave: Aba; rotulo: string; icone: typeof Plane }[] = [
  { chave: "todos", rotulo: "Todos", icone: LayoutGrid },
  { chave: "voos", rotulo: "Voos ✈️", icone: Plane },
  { chave: "onibus", rotulo: "Ônibus 🚌", icone: Bus },
];

/**
 * Buscar Passagens — abas para Todos, Voos e Ônibus, com o Concierge de IA no
 * topo para preencher a busca a partir de linguagem natural.
 */
export default function BuscarPassagensPage() {
  // Inicializa com o handoff do Concierge da página principal, se houver.
  const [handoff] = useState(() => lerHandoffInicial());
  const [aba, setAba] = useState<Aba>(handoff?.aba ?? "todos");
  const [preenchimento, setPreenchimento] = useState<ConciergeParse | null>(
    handoff?.dados ?? null
  );

  function aoInterpretar(dados: ConciergeParse) {
    setPreenchimento({ ...dados });
    // Se o concierge não achou IATAs (só ônibus por cidade), vai para "todos".
    if (dados.originIata && dados.destinationIata) setAba("voos");
  }

  return (
    <div className="space-y-8">
      <PageHeading
        title="Buscar Passagens"
        description="Voos (LATAM, Azul, GOL, Google Flights, Skyscanner, Decolar) e ônibus (Guanabara, Buser, UTIL, ClickBus, DeÔnibus, FlixBus, Gontijo, Cometa) em um só lugar."
      />

      <ConciergeBox onInterpretar={aoInterpretar} />

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
