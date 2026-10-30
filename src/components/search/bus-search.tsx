"use client";

import { useState } from "react";
import { Bus, Search } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass, labelClass } from "@/components/ui/field";
import { buildBusLinks, type ProviderLink } from "@/lib/deep-links";
import { saveSearch } from "@/lib/supabase/searches";
import { ProviderLinks } from "./provider-links";

/**
 * Buscar Passagens de Ônibus — Deep Linking Outbound.
 *
 * Gera links pré-preenchidos para Guanabara, Buser, Viação UTIL, ClickBus,
 * DeÔnibus, FlixBus, Gontijo e Cometa, e registra a busca no histórico.
 */
export function BusSearch() {
  const [form, setForm] = useState({
    originCity: "",
    destinationCity: "",
    departDate: "",
    returnDate: "",
  });
  const [links, setLinks] = useState<ProviderLink[] | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit =
    form.originCity.trim().length > 1 &&
    form.destinationCity.trim().length > 1 &&
    form.departDate.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = {
      originCity: form.originCity.trim(),
      destinationCity: form.destinationCity.trim(),
      departDate: form.departDate,
      returnDate: form.returnDate || undefined,
    };
    setLinks(buildBusLinks(q));
    void saveSearch("voo", { modal: "onibus", ...q });
  }

  return (
    <div className="space-y-8">
      <Card className="p-6">
        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="busOrigem">Origem (cidade)</label>
              <input id="busOrigem" className={inputClass} placeholder="Ex.: Belo Horizonte"
                value={form.originCity} onChange={(e) => update("originCity", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="busDestino">Destino (cidade)</label>
              <input id="busDestino" className={inputClass} placeholder="Ex.: Cabo Frio"
                value={form.destinationCity} onChange={(e) => update("destinationCity", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="busIda">Data de ida</label>
              <input id="busIda" type="date" className={inputClass}
                value={form.departDate} onChange={(e) => update("departDate", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="busVolta">Data de volta (opcional)</label>
              <input id="busVolta" type="date" className={inputClass} min={form.departDate || undefined}
                value={form.returnDate} onChange={(e) => update("returnDate", e.target.value)} />
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-subtle">
              Abrimos a busca já preenchida em cada viação. Preços e horários são do site parceiro.
            </p>
            <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
              <Search className="h-4 w-4" />
              Gerar opções de ônibus
            </Button>
          </div>
        </form>
      </Card>

      {links && (
        <section aria-label="Opções de ônibus" className="space-y-4">
          <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-heading">
            <Bus className="h-5 w-5 text-muted" />
            Viações e marketplaces
          </h2>
          <ProviderLinks title="Abrir busca pré-preenchida" links={links} />
        </section>
      )}
    </div>
  );
}
