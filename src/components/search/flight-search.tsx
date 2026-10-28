"use client";

import { useMemo, useState } from "react";
import {
  buildFlightLinks,
  type FlightQuery,
  type TripType,
  type CabinClass,
  type ProviderLink,
} from "@/lib/deep-links";
import { saveSearch } from "@/lib/supabase/searches";
import { Button } from "@/components/ui/button";
import { Plane, ExternalLink, ArrowLeftRight, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Buscar Viagem (voos) — Deep Linking Outbound + persistência no Supabase.
 * Gera cards para LATAM, Azul, GOL, Google Flights e Skyscanner.
 */

const inputClass =
  "h-11 w-full rounded-xl border border-field-border bg-white/85 px-3.5 text-sm text-heading placeholder:text-[color:var(--placeholder)] transition-colors focus:border-field-focus focus:outline-none focus:ring-4 focus:ring-field-focus/10 dark:bg-white/[0.04]";
const labelClass = "mb-1.5 block text-sm font-medium text-heading/80";

const CABINS: { value: CabinClass; label: string }[] = [
  { value: "economy", label: "Econômica" },
  { value: "premium", label: "Econômica Premium" },
  { value: "business", label: "Executiva" },
  { value: "first", label: "Primeira Classe" },
];

export function FlightSearch() {
  const [tripType, setTripType] = useState<TripType>("round");
  const [form, setForm] = useState({
    originCity: "",
    originIata: "",
    destinationCity: "",
    destinationIata: "",
    departDate: "",
    returnDate: "",
    passengers: 1,
    cabin: "economy" as CabinClass,
  });
  const [results, setResults] = useState<ProviderLink[] | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = useMemo(
    () =>
      form.originIata.trim().length > 0 &&
      form.destinationIata.trim().length > 0 &&
      form.departDate.length > 0,
    [form]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query: FlightQuery = {
      originCity: form.originCity.trim(),
      destinationCity: form.destinationCity.trim(),
      originIata: form.originIata.trim().toUpperCase(),
      destinationIata: form.destinationIata.trim().toUpperCase(),
      departDate: form.departDate,
      returnDate: tripType === "round" ? form.returnDate : undefined,
      tripType,
      passengers: form.passengers,
      cabin: form.cabin,
    };
    setResults(buildFlightLinks(query));
    // Persiste a busca (degrada graciosamente se o Supabase não estiver pronto).
    const res = await saveSearch("voo", query as unknown as Record<string, unknown>);
    setSaveMsg(res.message);
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="glass-surface rounded-2xl p-6">
        <div className="mb-6 inline-flex rounded-xl border border-sand-border bg-white/70 p-1 dark:bg-white/[0.04]">
          {([
            { key: "round", label: "Ida e volta" },
            { key: "oneway", label: "Só ida" },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTripType(t.key)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm transition-colors",
                tripType === t.key
                  ? "bg-accent-ink text-accent-on font-medium"
                  : "text-foreground hover:text-heading"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="originCity">Origem (cidade)</label>
            <input id="originCity" className={inputClass} placeholder="Ex.: Belo Horizonte"
              value={form.originCity} onChange={(e) => update("originCity", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="originIata">Origem (IATA)</label>
            <input id="originIata" className={cn(inputClass, "uppercase")} placeholder="Ex.: CNF"
              maxLength={3} value={form.originIata} onChange={(e) => update("originIata", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="destinationCity">Destino (cidade)</label>
            <input id="destinationCity" className={inputClass} placeholder="Ex.: Rio de Janeiro"
              value={form.destinationCity} onChange={(e) => update("destinationCity", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="destinationIata">Destino (IATA)</label>
            <input id="destinationIata" className={cn(inputClass, "uppercase")} placeholder="Ex.: GIG"
              maxLength={3} value={form.destinationIata} onChange={(e) => update("destinationIata", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="departDate">Data de ida</label>
            <input id="departDate" type="date" className={inputClass}
              value={form.departDate} onChange={(e) => update("departDate", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="returnDate">Data de volta</label>
            <input id="returnDate" type="date" className={inputClass} disabled={tripType === "oneway"}
              value={form.returnDate} onChange={(e) => update("returnDate", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="passengers">Passageiros</label>
            <input id="passengers" type="number" min={1} className={inputClass}
              value={form.passengers}
              onChange={(e) => update("passengers", Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="cabin">Classe</label>
            <select id="cabin" className={inputClass} value={form.cabin}
              onChange={(e) => update("cabin", e.target.value as CabinClass)}>
              {CABINS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-xs text-foreground/70">Informe os códigos IATA de origem e destino.</p>
          <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
            Gerar opções
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {results && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 font-serif text-2xl font-semibold text-heading">
            <Plane className="h-5 w-5 text-leather" />
            Opções de voo
          </h2>
          {saveMsg && <p className="mb-4 text-xs text-foreground/70">{saveMsg}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((link) => (
              <ResultCard key={link.id} link={link} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ResultCard({ link }: { link: ProviderLink }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer"
      className="glass-surface group flex flex-col justify-between rounded-2xl p-5 transition-colors hover:ring-leather/40">
      <div>
        <div className="flex items-center justify-between">
          <span className="font-serif text-xl font-semibold text-heading">{link.name}</span>
          <ExternalLink className="h-4 w-4 text-foreground/60 group-hover:text-heading" />
        </div>
        <p className="mt-1.5 text-sm text-foreground">{link.note}</p>
      </div>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-leather">
        Abrir pesquisa
        <ArrowLeftRight className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}
