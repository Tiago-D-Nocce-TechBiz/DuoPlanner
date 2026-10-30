"use client";

import { useMemo, useState } from "react";
import {
  buildFlightLinks,
  buildStayLinks,
  type FlightQuery,
} from "@/lib/deep-links";
import { iataDaCidade } from "@/lib/concierge";
import { readLocal, writeLocal, useMontado, STORAGE_KEYS } from "@/lib/local-store";

/**
 * Alertas de Preço.
 *
 * O usuário cria alertas (voo ou hospedagem) com destino, datas e preço-alvo.
 * Como esta é a Fase Front, o PlannerDuo não monitora preços automaticamente
 * ainda; cada alerta vira um atalho que abre a BUSCA JÁ PRÉ-PREENCHIDA no
 * parceiro para o usuário conferir o preço atual com um clique. O monitoramento
 * automático (e-mail/notificação) entra na Fase Back.
 */

type Tipo = "voo" | "hospedagem";

interface Alerta {
  id: string;
  tipo: Tipo;
  origem: string; // cidade (voo)
  destino: string; // cidade
  ida: string; // ISO
  volta: string; // ISO
  precoAlvo: string;
}

const novoId = () => Math.random().toString(36).substring(2, 9);

export default function AlertasPage() {
  const montado = useMontado();
  const salvos = useMemo<Alerta[]>(
    () => (montado ? readLocal<Alerta[]>(STORAGE_KEYS.alertas, []) : []),
    [montado]
  );
  const [alteracoes, setAlteracoes] = useState<Alerta[] | null>(null);
  const alertas = alteracoes ?? salvos;

  const [form, setForm] = useState<Omit<Alerta, "id">>({
    tipo: "voo",
    origem: "",
    destino: "",
    ida: "",
    volta: "",
    precoAlvo: "",
  });

  function persistir(next: Alerta[]) {
    setAlteracoes(next);
    writeLocal(STORAGE_KEYS.alertas, next);
  }

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.destino.trim() || !form.ida) return;
    persistir([{ id: novoId(), ...form }, ...alertas]);
    setForm({ tipo: "voo", origem: "", destino: "", ida: "", volta: "", precoAlvo: "" });
  };
  const remover = (id: string) => persistir(alertas.filter((a) => a.id !== id));

  // Gera o link de busca pré-preenchido para conferir o preço de um alerta.
  function linkDoAlerta(a: Alerta): string | null {
    if (a.tipo === "hospedagem") {
      const links = buildStayLinks({
        city: a.destino,
        checkin: a.ida,
        checkout: a.volta || a.ida,
        guests: 2,
        rooms: 1,
      });
      return links[0]?.url ?? null; // Booking (primeiro da lista)
    }
    const oIata = iataDaCidade(a.origem) ?? "";
    const dIata = iataDaCidade(a.destino) ?? "";
    if (!oIata || !dIata) return null; // sem IATA não dá para montar voo
    const q: FlightQuery = {
      originCity: a.origem,
      destinationCity: a.destino,
      originIata: oIata,
      destinationIata: dIata,
      departDate: a.ida,
      returnDate: a.volta || undefined,
      tripType: a.volta ? "round" : "oneway",
      passengers: 2,
      cabin: "economy",
    };
    return buildFlightLinks(q)[0]?.url ?? null; // Google Flights
  }

  const brl = (v: string) => {
    const n = parseFloat(v.replace(",", "."));
    return isNaN(n) ? "—" : `R$ ${n.toFixed(2).replace(".", ",")}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Alertas de Preço
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Guarde as viagens que você quer acompanhar e confira o preço atual com um clique.
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-4 flex items-start gap-3 ring-1 ring-[var(--color-border-strong)]">
        <span className="text-lg">🔔</span>
        <p className="text-xs text-[var(--color-muted)]">
          Nesta fase, cada alerta abre a busca pré-preenchida para você conferir o
          preço. O monitoramento automático com aviso por e-mail chega na próxima fase.
        </p>
      </div>

      {/* Criar alerta */}
      <form onSubmit={adicionar} className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Novo alerta</h2>

        <div className="inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-1">
          {(["voo", "hospedagem"] as Tipo[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ ...form, tipo: t })}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                form.tipo === t
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] font-medium"
                  : "text-[var(--color-muted)]"
              }`}
            >
              {t === "voo" ? "✈️ Voo" : "🏨 Hospedagem"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {form.tipo === "voo" && (
            <input
              type="text"
              placeholder="Origem (cidade)"
              value={form.origem}
              onChange={(e) => setForm({ ...form, origem: e.target.value })}
              className="glass-input"
            />
          )}
          <input
            type="text"
            placeholder={form.tipo === "voo" ? "Destino (cidade)" : "Cidade / destino"}
            value={form.destino}
            onChange={(e) => setForm({ ...form, destino: e.target.value })}
            className="glass-input"
          />
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">
              {form.tipo === "voo" ? "Ida" : "Check-in"}
            </label>
            <input type="date" value={form.ida} onChange={(e) => setForm({ ...form, ida: e.target.value })} className="glass-input" />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">
              {form.tipo === "voo" ? "Volta (opcional)" : "Check-out"}
            </label>
            <input type="date" value={form.volta} min={form.ida || undefined} onChange={(e) => setForm({ ...form, volta: e.target.value })} className="glass-input" />
          </div>
          <input
            type="text"
            placeholder="Preço-alvo R$ (ex.: 800,00)"
            value={form.precoAlvo}
            onChange={(e) => setForm({ ...form, precoAlvo: e.target.value })}
            className="glass-input"
          />
        </div>

        <button type="submit" className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer">
          + Criar alerta
        </button>
      </form>

      {/* Lista de alertas */}
      {alertas.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-[var(--color-muted)]">
          Nenhum alerta criado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {alertas.map((a) => {
            const link = linkDoAlerta(a);
            return (
              <div key={a.id} className="glass-panel rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-subtle)]">
                      {a.tipo === "voo" ? "✈️ Voo" : "🏨 Hospedagem"}
                    </span>
                    <p className="mt-1 font-serif text-lg font-bold text-[var(--color-heading)]">
                      {a.tipo === "voo" ? `${a.origem || "?"} → ${a.destino}` : a.destino}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {a.ida}{a.volta ? ` → ${a.volta}` : ""} · alvo {brl(a.precoAlvo)}
                    </p>
                  </div>
                  <button type="button" onClick={() => remover(a.id)} aria-label="Remover" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)] cursor-pointer">✕</button>
                </div>
                <div className="mt-4">
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                    >
                      Conferir preço agora →
                    </a>
                  ) : (
                    <p className="text-xs text-[var(--color-muted)]">
                      Informe cidades reconhecidas (ex.: São Paulo, Rio de Janeiro) para gerar o link de voo.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
