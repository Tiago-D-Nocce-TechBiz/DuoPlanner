"use client";

import { useMemo, useState } from "react";
import {
  buildFlightLinks,
  buildStayLinks,
  type FlightQuery,
} from "@/lib/deep-links";
import { iataDaCidade } from "@/lib/concierge";
import { isoToBR } from "@/lib/dates";
import { parseValorMonetario } from "@/lib/finance/importar";
import { useHoje } from "@/lib/local-store";
import type { AlertaPreco } from "@/lib/sync/modelos";
import { atualizarRegistro, criarRegistro, removerRegistro, useContextoSync, useRegistros } from "@/lib/sync/motor";
import { Bell, Plane, Hotel } from "@/components/ui/icons";

/**
 * Alertas de Preço — monitorados todo dia pelo servidor.
 *
 * Cada alerta fica no Postgres (visível para o casal). O worker diário
 * (`/api/cron/price-alerts`) consulta Kiwi (voos) ou Booking (hospedagem),
 * compara com o preço-alvo e manda e-mail para quem criou quando o preço
 * chega lá — no máximo um aviso a cada 3 dias, salvo nova queda de 5%.
 * O link "Conferir agora" continua abrindo a busca pré-preenchida.
 */

type Tipo = AlertaPreco["tipo"];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function linkDoAlerta(a: AlertaPreco): string | null {
  if (a.tipo === "hospedagem") {
    const links = buildStayLinks({ city: a.destino, checkin: a.ida, checkout: a.volta || a.ida, guests: a.adultos, rooms: 1 });
    return links[0]?.url ?? null;
  }
  const oIata = a.origemIata ?? iataDaCidade(a.origem) ?? "";
  const dIata = a.destinoIata ?? iataDaCidade(a.destino) ?? "";
  if (!oIata || !dIata) return null;
  const q: FlightQuery = {
    originCity: a.origem,
    destinationCity: a.destino,
    originIata: oIata,
    destinationIata: dIata,
    departDate: a.ida,
    returnDate: a.volta || undefined,
    tripType: a.volta ? "round" : "oneway",
    passengers: a.adultos,
    cabin: "economy",
  };
  return buildFlightLinks(q)[0]?.url ?? null;
}

function situacaoMonitoramento(a: AlertaPreco, hoje: string): string {
  if (a.ida < hoje) return "A data da viagem já passou: o monitoramento parou.";
  if (!a.ativo) return "Monitoramento pausado.";
  if (a.tipo === "voo" && (!a.origemIata || !a.destinoIata)) {
    return "Sem código de aeroporto para estas cidades: o monitoramento automático não roda (use o link).";
  }
  if (a.precoAlvo === null) return "Monitorado todo dia. Defina um preço-alvo para receber e-mail.";
  return "Monitorado todo dia: avisamos por e-mail quando chegar ao alvo.";
}

const FORM_VAZIO = { tipo: "voo" as Tipo, origem: "", destino: "", ida: "", volta: "", precoAlvo: "", adultos: "2" };

export default function AlertasPage() {
  const alertas = useRegistros("alertas");
  const ctx = useContextoSync();
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  // "" no prerender; a lista só existe depois da montagem (vem do motor).
  const hoje = useHoje();

  const ordenados = useMemo(() => [...alertas].sort((a, b) => a.ida.localeCompare(b.ida)), [alertas]);

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctx || !hoje) return;
    if (!form.destino.trim() || !form.ida) return setErro("Informe o destino e a data de ida.");
    if (form.ida < hoje) return setErro("A data de ida precisa ser hoje ou depois.");
    if (form.tipo === "hospedagem" && (!form.volta || form.volta <= form.ida)) {
      return setErro("Informe um check-out depois do check-in.");
    }
    if (form.volta && form.volta < form.ida) return setErro("A volta precisa ser depois da ida.");
    const preco = form.precoAlvo ? parseValorMonetario(form.precoAlvo) : null;
    if (form.precoAlvo && (preco === null || preco <= 0)) return setErro("Preço-alvo inválido (ex.: 800,00).");
    const adultos = Math.min(9, Math.max(1, Number(form.adultos) || 2));

    const alerta: AlertaPreco = {
      id: crypto.randomUUID(),
      userId: ctx.userId,
      workspaceId: ctx.workspace?.id ?? null,
      tipo: form.tipo,
      origem: form.tipo === "voo" ? form.origem.trim().slice(0, 80) : "",
      origemIata: form.tipo === "voo" ? iataDaCidade(form.origem) ?? null : null,
      destino: form.destino.trim().slice(0, 80),
      destinoIata: form.tipo === "voo" ? iataDaCidade(form.destino) ?? null : null,
      ida: form.ida,
      volta: form.volta || null,
      adultos,
      precoAlvo: preco,
      ativo: true,
      ultimoPreco: null,
      ultimoLink: null,
      ultimaVerificacaoEm: null,
      ultimoDisparoEm: null,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: ctx.userId,
    };
    criarRegistro("alertas", alerta);
    setForm(FORM_VAZIO);
    setErro(null);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">Alertas de Preço</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Diga quanto querem pagar: o DuoPlanner confere o preço todo dia e avisa por e-mail quando chegar lá.
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-4 flex items-start gap-3 ring-1 ring-[var(--color-border-strong)]">
        <Bell className="h-5 w-5 shrink-0 text-[var(--color-heading)]" />
        <p className="text-xs text-[var(--color-muted)]">
          O e-mail vai para quem criou o alerta (dá para desligar em Configurações). Voos precisam de cidades com
          aeroporto reconhecido; hospedagens, de check-in e check-out.
        </p>
      </div>

      <form onSubmit={adicionar} className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Novo alerta</h2>

        <div className="inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-1" role="radiogroup" aria-label="Tipo de alerta">
          {(["voo", "hospedagem"] as Tipo[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={form.tipo === t}
              onClick={() => setForm({ ...form, tipo: t })}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                form.tipo === t ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] font-medium" : "text-[var(--color-muted)]"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {t === "voo" ? <Plane className="h-4 w-4" /> : <Hotel className="h-4 w-4" />}
                {t === "voo" ? "Voo" : "Hospedagem"}
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {form.tipo === "voo" && (
            <input type="text" aria-label="Origem" placeholder="Origem (cidade)" value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} className="glass-input" />
          )}
          <input
            type="text"
            aria-label="Destino"
            placeholder={form.tipo === "voo" ? "Destino (cidade)" : "Cidade / destino"}
            value={form.destino}
            onChange={(e) => setForm({ ...form, destino: e.target.value })}
            className="glass-input"
          />
          <div>
            <label htmlFor="alerta-ida" className="block text-xs text-[var(--color-muted)] mb-1">{form.tipo === "voo" ? "Ida" : "Check-in"}</label>
            <input id="alerta-ida" type="date" min={hoje || undefined} value={form.ida} onChange={(e) => setForm({ ...form, ida: e.target.value })} className="glass-input" />
          </div>
          <div>
            <label htmlFor="alerta-volta" className="block text-xs text-[var(--color-muted)] mb-1">{form.tipo === "voo" ? "Volta (opcional)" : "Check-out"}</label>
            <input id="alerta-volta" type="date" value={form.volta} min={form.ida || hoje || undefined} onChange={(e) => setForm({ ...form, volta: e.target.value })} className="glass-input" />
          </div>
          <input type="text" inputMode="decimal" aria-label="Preço-alvo" placeholder="Preço-alvo total R$ (ex.: 1.600,00)" value={form.precoAlvo} onChange={(e) => setForm({ ...form, precoAlvo: e.target.value })} className="glass-input" />
          <select aria-label="Viajantes" value={form.adultos} onChange={(e) => setForm({ ...form, adultos: e.target.value })} className="glass-input">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? "viajante" : "viajantes"}</option>
            ))}
          </select>
        </div>
        {erro && <p role="alert" className="text-xs text-[var(--color-danger)]">{erro}</p>}

        <button type="submit" disabled={!ctx} className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60">
          + Criar alerta
        </button>
      </form>

      {ordenados.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-[var(--color-muted)]">Nenhum alerta criado ainda.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ordenados.map((a) => {
            const link = a.ultimoLink ?? linkDoAlerta(a);
            const atingiu = a.precoAlvo !== null && a.ultimoPreco !== null && a.ultimoPreco <= a.precoAlvo;
            return (
              <article key={a.id} className="glass-panel rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-subtle)]">
                      {a.tipo === "voo" ? <Plane className="h-3 w-3" /> : <Hotel className="h-3 w-3" />}
                      {a.tipo === "voo" ? "Voo" : "Hospedagem"} · {a.adultos} {a.adultos === 1 ? "viajante" : "viajantes"}
                    </span>
                    <p className="mt-1 font-serif text-lg font-bold text-[var(--color-heading)]">
                      {a.tipo === "voo" ? `${a.origem || "?"} → ${a.destino}` : a.destino}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {isoToBR(a.ida)}{a.volta ? ` → ${isoToBR(a.volta)}` : ""} · alvo {a.precoAlvo !== null ? brl(a.precoAlvo) : "—"}
                    </p>
                  </div>
                  <button type="button" onClick={() => removerRegistro("alertas", a.id)} aria-label={`Remover alerta para ${a.destino}`} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)] cursor-pointer">✕</button>
                </div>

                {a.ultimoPreco !== null && (
                  <p className={`mt-3 text-sm ${atingiu ? "font-semibold text-[var(--color-heading)]" : "text-[var(--color-foreground)]"}`}>
                    Último preço encontrado: {brl(a.ultimoPreco)}
                    {a.ultimaVerificacaoEm && (
                      <span className="text-xs text-[var(--color-muted)]"> · {isoToBR(a.ultimaVerificacaoEm.slice(0, 10))}</span>
                    )}
                    {atingiu && " · chegou ao alvo!"}
                  </p>
                )}
                <p className="mt-2 text-xs text-[var(--color-muted)]">{situacaoMonitoramento(a, hoje)}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)]">
                      Conferir preço agora →
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">Informe cidades reconhecidas (ex.: São Paulo, Lisboa) para gerar o link.</span>
                  )}
                  {a.ida >= hoje && (
                    <button
                      type="button"
                      onClick={() => atualizarRegistro("alertas", a.id, { ativo: !a.ativo })}
                      className="px-3 py-2 rounded-xl text-xs font-semibold glass-panel cursor-pointer"
                    >
                      {a.ativo ? "Pausar" : "Retomar"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
