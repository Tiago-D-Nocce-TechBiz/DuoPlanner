"use client";

import { useEffect, useState, useTransition } from "react";
import { BedDouble, Brain, Loader2, Search, SlidersHorizontal } from "lucide-react";
import {
  sugerirExperienciasLocais,
  type LocalGemsResult,
} from "@/app/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass, labelClass } from "@/components/ui/field";
import { buildStayLinks, type ProviderLink } from "@/lib/deep-links";
import type { ConciergeParse } from "@/lib/concierge";
import { saveSearch } from "@/lib/supabase/searches";
import { readLocal, writeLocal, STORAGE_KEYS } from "@/lib/local-store";
import type { HotelSearchResponse, SearchErrorBody } from "@/lib/travel/types";
import { cn } from "@/lib/utils";
import { HotelCard } from "./hotel-card";
import { LocalGems } from "./local-gems";
import { ProviderLinks } from "./provider-links";

/**
 * Buscar Hospedagem — Booking.com via RapidAPI (/api/hotels).
 *
 * Preço TOTAL da estadia para a dupla (2 adultos por padrão) e ranking de
 * custo-benefício calculado no servidor. Orçamento e nota mínima vazios usam a
 * memória da IA. Depois da busca, a etapa Experiências Ocultas entra em cena.
 */

type Outcome =
  | { ok: true; data: HotelSearchResponse }
  | { ok: false; error: SearchErrorBody };

async function requestHotels(params: URLSearchParams): Promise<Outcome> {
  try {
    const res = await fetch(`/api/hotels?${params}`, {
      headers: { accept: "application/json" },
    });
    // Parse defensivo: se a resposta não for JSON válido (ex.: erro 5xx com
    // HTML), não deixamos o await lançar e derrubar o componente.
    const texto = await res.text();
    let body: unknown = null;
    try {
      body = texto ? JSON.parse(texto) : null;
    } catch {
      body = null;
    }
    if (res.ok && body) {
      return { ok: true, data: body as HotelSearchResponse };
    }
    return {
      ok: false,
      error:
        (body as SearchErrorBody) ?? {
          error: "Não foi possível buscar hospedagens agora. Tente novamente.",
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

export function StaySearch() {
  // Estado inicial determinístico (igual no servidor e no cliente).
  const [form, setForm] = useState({
    city: "",
    checkin: "",
    checkout: "",
    adults: 2,
    rooms: 1,
    budget: "",
    minScore: "",
    useMemory: false,
  });

  // Pré-preenchimento do Concierge aplicado APÓS a montagem (evita hydration
  // mismatch). O setState vai num microtask para não ser síncrono dentro do
  // efeito — mantém o HTML inicial idêntico ao do servidor.
  useEffect(() => {
    const h = readLocal<{ dados: ConciergeParse; modo: string } | null>(
      STORAGE_KEYS.concierge,
      null
    );
    if (!h || h.modo !== "hospedagem") return;
    writeLocal(STORAGE_KEYS.concierge, null);
    queueMicrotask(() => {
      setForm((prev) => ({
        ...prev,
        city: h.dados.destinationCity ?? prev.city,
        checkin: h.dados.departDate ?? prev.checkin,
        checkout: h.dados.returnDate ?? prev.checkout,
        adults: h.dados.passengers ?? prev.adults,
      }));
    });
  }, []);

  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [links, setLinks] = useState<ProviderLink[]>([]);
  const [gems, setGems] = useState<Promise<LocalGemsResult> | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit =
    form.city.trim().length >= 2 &&
    form.checkin.length > 0 &&
    form.checkout.length > 0 &&
    form.checkout > form.checkin &&
    !pending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const city = form.city.trim();
    const params = new URLSearchParams({
      city,
      checkin: form.checkin,
      checkout: form.checkout,
      adults: String(form.adults),
      rooms: String(form.rooms),
      memory: form.useMemory ? "1" : "0",
    });
    if (form.budget) params.set("budget", form.budget);
    if (form.minScore) params.set("minScore", form.minScore);

    const providerLinks = buildStayLinks({
      city,
      checkin: form.checkin,
      checkout: form.checkout,
      guests: form.adults,
      rooms: form.rooms,
    });

    startTransition(async () => {
      const result = await requestHotels(params);
      const destination = result.ok ? result.data.destination.name : city;
      startTransition(() => {
        setOutcome(result);
        setLinks(providerLinks);
        setGems(sugerirExperienciasLocais(destination, form.checkin));
      });
      void saveSearch("hospedagem", {
        city: destination,
        checkin: form.checkin,
        checkout: form.checkout,
        guests: form.adults,
        rooms: form.rooms,
      });
    });
  }

  return (
    <div className="space-y-10">
      <Card className="p-6">
        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="city">Destino</label>
              <input id="city" className={inputClass} placeholder="Ex.: Lisboa"
                autoComplete="off" value={form.city}
                onChange={(e) => update("city", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="checkin">Check-in</label>
              <input id="checkin" type="date" className={inputClass} value={form.checkin}
                onChange={(e) => update("checkin", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="checkout">Check-out</label>
              <input id="checkout" type="date" className={inputClass} value={form.checkout}
                min={form.checkin || undefined}
                onChange={(e) => update("checkout", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="adults">Hóspedes</label>
              <input id="adults" type="number" min={1} max={8} className={inputClass}
                value={form.adults}
                onChange={(e) => update("adults", Math.min(8, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
            <div>
              <label className={labelClass} htmlFor="rooms">Quartos</label>
              <input id="rooms" type="number" min={1} max={4} className={inputClass}
                value={form.rooms}
                onChange={(e) => update("rooms", Math.min(4, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
          </div>

          <details className="mt-6 rounded-xl border border-border bg-background">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-muted transition-colors hover:text-heading">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros avançados (opcional)
            </summary>
            <div className="grid gap-5 border-t border-border p-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="budget">Orçamento total da estadia (R$)</label>
                <input id="budget" type="number" min={1} className={inputClass}
                  placeholder="Ex.: 3000" value={form.budget}
                  onChange={(e) => update("budget", e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="minScore">Nota mínima (0–10)</label>
                <input id="minScore" type="number" min={0} max={10} step={0.5} className={inputClass}
                  placeholder="Ex.: 8" value={form.minScore}
                  onChange={(e) => update("minScore", e.target.value)} />
              </div>
              <label className="flex items-center gap-2.5 text-sm text-foreground sm:col-span-2">
                <input type="checkbox" checked={form.useMemory}
                  onChange={(e) => update("useMemory", e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-background accent-zinc-300" />
                Usar minhas preferências salvas para preencher filtros vazios
              </label>
            </div>
          </details>

          <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-subtle">
              Preço total da estadia para {form.adults} {form.adults === 1 ? "pessoa" : "pessoas"}, ordenado por custo-benefício.
            </p>
            <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {pending ? "Buscando…" : "Buscar hospedagens"}
            </Button>
          </div>
        </form>
      </Card>

      {pending && <ResultsSkeleton />}

      {!pending && outcome && (
        <section aria-label="Resultados de hospedagem" className="space-y-6">
          {outcome.ok ? (
            <>
              <div>
                <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold">
                  <BedDouble className="h-5 w-5 text-muted" />
                  {outcome.data.hotels.length
                    ? `${outcome.data.hotels.length} hospedagens em ${outcome.data.destination.name}`
                    : `Nenhuma hospedagem em ${outcome.data.destination.name}`}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {outcome.data.hotels.length
                    ? `Melhor custo-benefício primeiro · ${outcome.data.nights} ${outcome.data.nights === 1 ? "noite" : "noites"} para ${outcome.data.adults} ${outcome.data.adults === 1 ? "pessoa" : "pessoas"}`
                    : "Tente outras datas ou reduza a nota mínima."}
                </p>
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

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {outcome.data.hotels.map((hotel, index) => (
                  <HotelCard
                    key={hotel.id}
                    hotel={hotel}
                    best={index === 0 && hotel.withinBudget !== false}
                    adults={outcome.data.adults}
                    nights={outcome.data.nights}
                  />
                ))}
              </div>

              <ProviderLinks title="Compare também" links={links} />
            </>
          ) : (
            <Card className="space-y-5 p-6">
              <div>
                <h2 className="font-serif text-xl font-semibold">
                  {outcome.error.code === "BOOKING_NOT_CONFIGURED"
                    ? "Motor da Booking.com ainda não está ativo"
                    : "Não foi possível buscar hospedagens"}
                </h2>
                <p className={cn(
                  "mt-1.5 text-sm",
                  outcome.error.code === "BOOKING_NOT_CONFIGURED" ? "text-muted" : "text-danger"
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="overflow-hidden">
          <div className="aspect-[16/10] animate-pulse bg-elevated" />
          <div className="space-y-3 p-5">
            <div className="h-5 w-2/3 animate-pulse rounded bg-elevated" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-elevated" />
            <div className="h-7 w-1/3 animate-pulse rounded bg-elevated" />
          </div>
        </Card>
      ))}
    </div>
  );
}
