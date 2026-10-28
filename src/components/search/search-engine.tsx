"use client";

import { useMemo, useState } from "react";
import {
  buildProviderLinks,
  type SearchQuery,
  type TripType,
  type ProviderLink,
} from "@/lib/deep-links";
import { Button } from "@/components/ui/button";
import {
  Plane,
  BedDouble,
  ExternalLink,
  ArrowLeftRight,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Motor de Busca — Deep Linking Outbound (client component).
 *
 * Recolhe os dados da viagem e, ao submeter, gera as opções clicáveis via
 * buildProviderLinks. NÃO faz pesquisa interna: cada opção abre a página de
 * resultados pré-preenchida do parceiro num novo separador (target="_blank"
 * + rel="noopener noreferrer" por segurança).
 */

const inputClass =
  "h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent focus:outline-none";

const labelClass = "mb-1.5 block text-sm font-medium text-zinc-300";

export function SearchEngine() {
  const [tripType, setTripType] = useState<TripType>("round");
  const [form, setForm] = useState({
    originCity: "",
    originIata: "",
    destinationCity: "",
    destinationIata: "",
    departDate: "",
    returnDate: "",
    adults: 2,
    children: 0,
  });
  const [results, setResults] = useState<ProviderLink[] | null>(null);

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = useMemo(() => {
    const hasStay = form.destinationCity.trim().length > 0;
    const hasFlight =
      form.originIata.trim().length > 0 &&
      form.destinationIata.trim().length > 0;
    return (hasStay || hasFlight) && form.departDate.length > 0;
  }, [form]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query: SearchQuery = {
      originCity: form.originCity.trim(),
      destinationCity: form.destinationCity.trim(),
      originIata: form.originIata.trim().toUpperCase(),
      destinationIata: form.destinationIata.trim().toUpperCase(),
      departDate: form.departDate,
      returnDate: tripType === "round" ? form.returnDate : undefined,
      tripType,
      adults: form.adults,
      children: form.children,
    };
    setResults(buildProviderLinks(query));
  }

  const stays = results?.filter((r) => r.category === "stay") ?? [];
  const flights = results?.filter((r) => r.category === "flight") ?? [];

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
      >
        {/* Tipo de viagem */}
        <div className="mb-6 inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {([
            { key: "round", label: "Ida e volta" },
            { key: "oneway", label: "Só ida" },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTripType(t.key)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm transition-colors",
                tripType === t.key
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-zinc-400 hover:text-zinc-100"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Origem */}
          <div>
            <label className={labelClass} htmlFor="originCity">
              Origem (cidade)
            </label>
            <input
              id="originCity"
              className={inputClass}
              placeholder="Ex.: Lisboa"
              value={form.originCity}
              onChange={(e) => update("originCity", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="originIata">
              Origem (código IATA — para voos)
            </label>
            <input
              id="originIata"
              className={cn(inputClass, "uppercase")}
              placeholder="Ex.: LIS"
              maxLength={3}
              value={form.originIata}
              onChange={(e) => update("originIata", e.target.value)}
            />
          </div>

          {/* Destino */}
          <div>
            <label className={labelClass} htmlFor="destinationCity">
              Destino (cidade)
            </label>
            <input
              id="destinationCity"
              className={inputClass}
              placeholder="Ex.: Rio de Janeiro"
              value={form.destinationCity}
              onChange={(e) => update("destinationCity", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="destinationIata">
              Destino (código IATA — para voos)
            </label>
            <input
              id="destinationIata"
              className={cn(inputClass, "uppercase")}
              placeholder="Ex.: GIG"
              maxLength={3}
              value={form.destinationIata}
              onChange={(e) => update("destinationIata", e.target.value)}
            />
          </div>

          {/* Datas */}
          <div>
            <label className={labelClass} htmlFor="departDate">
              Data de ida
            </label>
            <input
              id="departDate"
              type="date"
              className={cn(inputClass, "[color-scheme:dark]")}
              value={form.departDate}
              onChange={(e) => update("departDate", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="returnDate">
              Data de volta
            </label>
            <input
              id="returnDate"
              type="date"
              className={cn(inputClass, "[color-scheme:dark]")}
              value={form.returnDate}
              disabled={tripType === "oneway"}
              onChange={(e) => update("returnDate", e.target.value)}
            />
          </div>

          {/* Passageiros */}
          <div>
            <label className={labelClass} htmlFor="adults">
              Adultos
            </label>
            <input
              id="adults"
              type="number"
              min={1}
              className={inputClass}
              value={form.adults}
              onChange={(e) =>
                update("adults", Math.max(1, Number(e.target.value) || 1))
              }
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="children">
              Crianças
            </label>
            <input
              id="children"
              type="number"
              min={0}
              className={inputClass}
              value={form.children}
              onChange={(e) =>
                update("children", Math.max(0, Number(e.target.value) || 0))
              }
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-xs text-zinc-500">
            Preencha a cidade de destino (estadias) e/ou os códigos IATA (voos).
          </p>
          <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
            Gerar opções
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {/* Resultados */}
      {results && (
        <div className="space-y-8">
          {results.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-10 text-center text-sm text-zinc-400">
              Nenhuma opção gerada. Para estadias, indique a cidade de destino.
              Para voos, indique os códigos IATA de origem e destino.
            </div>
          )}

          {flights.length > 0 && (
            <ResultGroup
              title="Voos"
              icon={<Plane className="h-5 w-5 text-accent" />}
              links={flights}
            />
          )}
          {stays.length > 0 && (
            <ResultGroup
              title="Estadias"
              icon={<BedDouble className="h-5 w-5 text-accent" />}
              links={stays}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Grupo de resultados (voos ou estadias). */
function ResultGroup({
  title,
  icon,
  links,
}: {
  title: string;
  icon: React.ReactNode;
  links: ProviderLink[];
}) {
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 font-serif text-xl font-semibold text-zinc-100">
        {icon}
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-accent/50"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-serif text-lg font-semibold text-zinc-100">
                  {link.name}
                </span>
                <ExternalLink className="h-4 w-4 text-zinc-500 group-hover:text-accent" />
              </div>
              <p className="mt-1.5 text-sm text-zinc-400">{link.note}</p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
              Abrir pesquisa
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
