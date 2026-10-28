"use client";

import { useMemo, useState } from "react";
import {
  buildStayLinks,
  type StayQuery,
  type ProviderLink,
} from "@/lib/deep-links";
import { saveSearch } from "@/lib/supabase/searches";
import { Button } from "@/components/ui/button";
import { BedDouble, ExternalLink, ArrowLeftRight, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Buscar Hospedagem — Deep Linking Outbound + persistência no Supabase.
 * Gera cards para Airbnb, Booking.com, Hoteis.com e Trivago.
 */

const inputClass =
  "h-11 w-full rounded-xl border border-field-border bg-white/85 px-3.5 text-sm text-heading placeholder:text-[color:var(--placeholder)] transition-colors focus:border-field-focus focus:outline-none focus:ring-4 focus:ring-field-focus/10 dark:bg-white/[0.04]";
const labelClass = "mb-1.5 block text-sm font-medium text-heading/80";

export function StaySearch() {
  const [form, setForm] = useState({
    city: "",
    checkin: "",
    checkout: "",
    guests: 2,
    rooms: 1,
  });
  const [results, setResults] = useState<ProviderLink[] | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = useMemo(
    () => form.city.trim().length > 0 && form.checkin.length > 0 && form.checkout.length > 0,
    [form]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query: StayQuery = {
      city: form.city.trim(),
      checkin: form.checkin,
      checkout: form.checkout,
      guests: form.guests,
      rooms: form.rooms,
    };
    setResults(buildStayLinks(query));
    const res = await saveSearch(
      "hospedagem",
      query as unknown as Record<string, unknown>
    );
    setSaveMsg(res.message);
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="glass-surface rounded-2xl p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass} htmlFor="city">Cidade / Destino</label>
            <input id="city" className={inputClass} placeholder="Ex.: Rio de Janeiro"
              value={form.city} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="checkin">Check-in</label>
            <input id="checkin" type="date" className={inputClass}
              value={form.checkin} onChange={(e) => update("checkin", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="checkout">Check-out</label>
            <input id="checkout" type="date" className={inputClass}
              value={form.checkout} onChange={(e) => update("checkout", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="guests">Hóspedes</label>
            <input id="guests" type="number" min={1} className={inputClass}
              value={form.guests}
              onChange={(e) => update("guests", Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="rooms">Quartos</label>
            <input id="rooms" type="number" min={1} className={inputClass}
              value={form.rooms}
              onChange={(e) => update("rooms", Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-xs text-foreground/70">Informe a cidade e as datas de check-in e check-out.</p>
          <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
            Gerar opções
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {results && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 font-serif text-2xl font-semibold text-heading">
            <BedDouble className="h-5 w-5 text-leather" />
            Opções de hospedagem
          </h2>
          {saveMsg && <p className="mb-4 text-xs text-foreground/70">{saveMsg}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
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
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
