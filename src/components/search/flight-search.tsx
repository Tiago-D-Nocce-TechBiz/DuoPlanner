"use client";

import { useState, useTransition } from "react";
import { Brain, Loader2, Plane, Search, SlidersHorizontal } from "lucide-react";
import {
  sugerirExperienciasLocais,
  type LocalGemsResult,
} from "@/app/dashboard/actions";
import type { ConciergeParse } from "@/lib/concierge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass, labelClass } from "@/components/ui/field";
import { addDays } from "@/lib/dates";
import { buildFlightLinks, type ProviderLink } from "@/lib/deep-links";
import { saveSearch } from "@/lib/supabase/searches";
import type {
  CabinClass,
  FlightSearchResponse,
  FlightTripType,
  SearchErrorBody,
} from "@/lib/travel/types";
import { cn } from "@/lib/utils";
import { FlightOfferCard } from "./flight-offer-card";
import { LocalGems } from "./local-gems";
import { ProviderLinks } from "./provider-links";

/**
 * Buscar Viagem — motor de voos (Kiwi.com Tequila via /api/flights).
 *
 * - Janela flexível: "ida entre" duas datas + faixa de noites no destino.
 * - Filtros vazios usam a memória da IA (escalas, duração de escala, orçamento).
 * - Depois da busca, a etapa Experiências Ocultas sugere 3 passeios baratos.
 * - Os deep links da Fase 1 continuam como comparação e como alternativa
 *   quando a chave da Kiwi não está configurada.
 */

const CABINS: { value: CabinClass; label: string }[] = [
  { value: "economy", label: "Econômica" },
  { value: "premium", label: "Econômica Premium" },
  { value: "business", label: "Executiva" },
  { value: "first", label: "Primeira Classe" },
];

const STOPOVER_OPTIONS = [
  { value: "", label: "Memória da IA / qualquer" },
  { value: "0", label: "Somente diretos" },
  { value: "1", label: "Até 1 escala por trecho" },
  { value: "2", label: "Até 2 escalas por trecho" },
];

type Outcome =
  | { ok: true; data: FlightSearchResponse }
  | { ok: false; error: SearchErrorBody };

async function requestFlights(params: URLSearchParams): Promise<Outcome> {
  try {
    const res = await fetch(`/api/flights?${params}`, {
      headers: { accept: "application/json" },
    });
    // Parse defensivo: evita que uma resposta não-JSON (ex.: erro 5xx com HTML)
    // faça o await lançar e derrubar o componente.
    const texto = await res.text();
    let body: unknown = null;
    try {
      body = texto ? JSON.parse(texto) : null;
    } catch {
      body = null;
    }
    if (res.ok && body) {
      return { ok: true, data: body as FlightSearchResponse };
    }
    return {
      ok: false,
      error:
        (body as SearchErrorBody) ?? {
          error: "Não foi possível buscar os voos agora. Tente novamente.",
          code: "UPSTREAM_ERROR",
        },
    };
  } catch {
    return {
      ok: false,
      error: { error: "Sem conexão com o servidor. Tente novamente.", code: "UPSTREAM_ERROR" },
    };
  }
}

export function FlightSearch({ preenchimento }: { preenchimento?: ConciergeParse | null }) {
  const [form, setForm] = useState({
    tripType: "round" as FlightTripType,
    from: "",
    to: "",
    dateFrom: "",
    dateTo: "",
    nightsFrom: 5,
    nightsTo: 8,
    adults: 2,
    cabin: "economy" as CabinClass,
    maxStopovers: "",
    maxLayoverHours: "",
    budget: "",
    useMemory: true,
  });
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [links, setLinks] = useState<ProviderLink[]>([]);
  const [gems, setGems] = useState<Promise<LocalGemsResult> | null>(null);

  // Preenchimento vindo do Concierge de IA. Em vez de um efeito que chama
  // setState, sincronizamos durante o render comparando a referência anterior
  // (padrão recomendado pelo React para "ajustar estado quando a prop muda").
  const [preenchimentoAnterior, setPreenchimentoAnterior] =
    useState<ConciergeParse | null>(null);
  if (preenchimento && preenchimento !== preenchimentoAnterior) {
    setPreenchimentoAnterior(preenchimento);
    setForm((prev) => ({
      ...prev,
      from: preenchimento.originIata ?? prev.from,
      to: preenchimento.destinationIata ?? prev.to,
      dateFrom: preenchimento.departDate ?? prev.dateFrom,
      dateTo: preenchimento.returnDate ?? prev.dateTo,
      adults: preenchimento.passengers ?? prev.adults,
      tripType: preenchimento.returnDate ? "round" : prev.tripType,
    }));
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isRound = form.tripType === "round";
  const canSubmit =
    /^[A-Za-z]{3}$/.test(form.from.trim()) &&
    /^[A-Za-z]{3}$/.test(form.to.trim()) &&
    form.dateFrom.length > 0 &&
    !pending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = form.from.trim().toUpperCase();
    const to = form.to.trim().toUpperCase();
    const nightsTo = Math.max(form.nightsTo, form.nightsFrom);

    const params = new URLSearchParams({
      from,
      to,
      dateFrom: form.dateFrom,
      tripType: form.tripType,
      adults: String(form.adults),
      cabin: form.cabin,
      memory: form.useMemory ? "1" : "0",
    });
    if (form.dateTo) params.set("dateTo", form.dateTo);
    if (isRound) {
      params.set("nightsFrom", String(form.nightsFrom));
      params.set("nightsTo", String(nightsTo));
    }
    if (form.maxStopovers) params.set("maxStopovers", form.maxStopovers);
    if (form.maxLayoverHours) params.set("maxLayoverHours", form.maxLayoverHours);
    if (form.budget) params.set("budget", form.budget);

    const providerLinks = buildFlightLinks({
      originIata: from,
      destinationIata: to,
      departDate: form.dateFrom,
      returnDate: isRound ? addDays(form.dateFrom, form.nightsFrom) : undefined,
      tripType: form.tripType,
      passengers: form.adults,
      cabin: form.cabin,
    });

    startTransition(async () => {
      const result = await requestFlights(params);
      const city = result.ok ? result.data.offers[0]?.outbound.to.city : undefined;
      startTransition(() => {
        setOutcome(result);
        setLinks(providerLinks);
        // Etapa seguinte do plano: experiências ocultas no destino escolhido.
        setGems(sugerirExperienciasLocais(city ?? to, form.dateFrom));
      });
      // Histórico de buscas da Fase 1 (tabela `viagens`), sem bloquear a UI.
      void saveSearch("voo", {
        originCity: from,
        destinationCity: city ?? to,
        originIata: from,
        destinationIata: to,
        departDate: form.dateFrom,
        departDateTo: form.dateTo || form.dateFrom,
        tripType: form.tripType,
        nights: isRound ? [form.nightsFrom, nightsTo] : null,
        passengers: form.adults,
        cabin: form.cabin,
      });
    });
  }

  return (
    <div className="space-y-10">
      <Card className="p-6">
        <form onSubmit={handleSubmit}>
          <div
            role="radiogroup"
            aria-label="Tipo de viagem"
            className="mb-6 inline-flex rounded-xl border border-border bg-background p-1"
          >
            {([
              { key: "round", label: "Ida e volta" },
              { key: "oneway", label: "Só ida" },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={form.tripType === t.key}
                onClick={() => update("tripType", t.key)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm transition-colors",
                  form.tripType === t.key
                    ? "bg-elevated font-medium text-heading"
                    : "text-muted hover:text-heading"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="from">Origem (IATA)</label>
              <input id="from" className={cn(inputClass, "uppercase")} placeholder="GRU"
                maxLength={3} autoComplete="off" value={form.from}
                onChange={(e) => update("from", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="to">Destino (IATA)</label>
              <input id="to" className={cn(inputClass, "uppercase")} placeholder="LIS"
                maxLength={3} autoComplete="off" value={form.to}
                onChange={(e) => update("to", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="dateFrom">Ida a partir de</label>
              <input id="dateFrom" type="date" className={inputClass} value={form.dateFrom}
                onChange={(e) => update("dateFrom", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="dateTo">Ida até (opcional)</label>
              <input id="dateTo" type="date" className={inputClass} value={form.dateTo}
                min={form.dateFrom || undefined}
                onChange={(e) => update("dateTo", e.target.value)} />
            </div>

            {isRound && (
              <>
                <div>
                  <label className={labelClass} htmlFor="nightsFrom">Noites (mín.)</label>
                  <input id="nightsFrom" type="number" min={1} max={30} className={inputClass}
                    value={form.nightsFrom}
                    onChange={(e) => update("nightsFrom", Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="nightsTo">Noites (máx.)</label>
                  <input id="nightsTo" type="number" min={1} max={30} className={inputClass}
                    value={form.nightsTo}
                    onChange={(e) => update("nightsTo", Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
                </div>
              </>
            )}
            <div>
              <label className={labelClass} htmlFor="adults">Passageiros</label>
              <input id="adults" type="number" min={1} max={9} className={inputClass}
                value={form.adults}
                onChange={(e) => update("adults", Math.min(9, Math.max(1, Number(e.target.value) || 1)))} />
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

          <details className="group mt-6 rounded-xl border border-border bg-background">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-muted transition-colors hover:text-heading">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros e memória da IA
            </summary>
            <div className="grid gap-5 border-t border-border p-4 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="maxStopovers">Escalas</label>
                <select id="maxStopovers" className={inputClass} value={form.maxStopovers}
                  onChange={(e) => update("maxStopovers", e.target.value)}>
                  {STOPOVER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="maxLayoverHours">Escala máxima (horas)</label>
                <input id="maxLayoverHours" type="number" min={1} max={48} className={inputClass}
                  placeholder="Ex.: 4" value={form.maxLayoverHours}
                  onChange={(e) => update("maxLayoverHours", e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="budget">Orçamento total (R$)</label>
                <input id="budget" type="number" min={1} className={inputClass}
                  placeholder="Ex.: 5000" value={form.budget}
                  onChange={(e) => update("budget", e.target.value)} />
              </div>
              <label className="flex items-center gap-2.5 text-sm text-foreground sm:col-span-3">
                <input type="checkbox" checked={form.useMemory}
                  onChange={(e) => update("useMemory", e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-background accent-zinc-300" />
                Usar as preferências que a IA memorizou para preencher filtros vazios
              </label>
            </div>
          </details>

          <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-subtle">
              Datas flexíveis: a Kiwi.com cruza a janela de ida com as noites no destino.
            </p>
            <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {pending ? "Buscando…" : "Buscar voos"}
            </Button>
          </div>
        </form>
      </Card>

      {pending && <ResultsSkeleton />}

      {!pending && outcome && (
        <section aria-label="Resultados de voos" className="space-y-6">
          {outcome.ok ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold">
                    <Plane className="h-5 w-5 text-muted" />
                    {outcome.data.offers.length
                      ? `${outcome.data.offers.length} combinações de voo`
                      : "Nenhum voo com esses filtros"}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {outcome.data.offers.length
                      ? `Menor preço primeiro · valores totais para ${outcome.data.adults} ${outcome.data.adults === 1 ? "passageiro" : "passageiros"}`
                      : "Amplie a janela de datas, a faixa de noites ou o limite de escalas."}
                  </p>
                </div>
              </div>

              {outcome.data.appliedPreferences.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {outcome.data.appliedPreferences.map((p) => (
                    <Badge key={p} variant="outline">
                      <Brain className="h-3 w-3" />
                      {p}
                    </Badge>
                  ))}
                </div>
              )}
              {outcome.data.budgetNotice && (
                <p className="text-sm text-muted">{outcome.data.budgetNotice}</p>
              )}

              <div className="space-y-4">
                {outcome.data.offers.map((offer) => (
                  <FlightOfferCard
                    key={offer.id}
                    offer={offer}
                    adults={outcome.data.adults}
                    isCheapest={offer.id === outcome.data.cheapestId}
                    isFastest={
                      offer.id === outcome.data.fastestId &&
                      offer.id !== outcome.data.cheapestId
                    }
                  />
                ))}
              </div>

              <ProviderLinks title="Compare também" links={links} />
            </>
          ) : (
            <Card className="space-y-5 p-6">
              <div>
                <h2 className="font-serif text-xl font-semibold">
                  {outcome.error.code === "KIWI_NOT_CONFIGURED"
                    ? "Motor da Kiwi.com ainda não está ativo"
                    : "Não foi possível buscar os voos"}
                </h2>
                <p className={cn(
                  "mt-1.5 text-sm",
                  outcome.error.code === "KIWI_NOT_CONFIGURED" ? "text-muted" : "text-danger"
                )}>
                  {outcome.error.error}
                </p>
              </div>
              <ProviderLinks title="Pesquise direto nos parceiros" links={links} />
            </Card>
          )}
        </section>
      )}

      {gems && !pending && <LocalGems promise={gems} />}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-6">
          <div className="h-7 w-32 animate-pulse rounded bg-elevated" />
          <div className="mt-6 h-10 w-full animate-pulse rounded bg-elevated" />
          <div className="mt-4 h-10 w-full animate-pulse rounded bg-elevated" />
        </Card>
      ))}
    </div>
  );
}
