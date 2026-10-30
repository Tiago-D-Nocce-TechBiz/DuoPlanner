"use client";

import { useState } from "react";
import { Sparkles, Plane, Bus, Hotel, Users, Clock } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProviderLinks } from "./provider-links";
import {
  interpretarBusca,
  inferirIntencao,
  iataDaCidade,
  type ConciergeParse,
  type ConciergeIntencao,
} from "@/lib/concierge";
import {
  buildFlightLinks,
  buildBusLinks,
  buildStayLinks,
  type ProviderLink,
} from "@/lib/deep-links";
import { todayInSaoPaulo, addDays, monthLabel } from "@/lib/dates";
import { saveSearch } from "@/lib/supabase/searches";

/**
 * Concierge de IA — AGENTE completo (sem redirecionar para formulários).
 *
 * O usuário descreve a viagem em linguagem natural; o agente:
 *  1. interpreta a frase (origem, destino, datas, passageiros);
 *  2. infere a intenção (passagens ou hospedagem) — mas monta os dois tipos de
 *     link quando faz sentido, priorizando a intenção detectada;
 *  3. resolve um período real (usa as datas informadas; se faltarem, assume um
 *     padrão sensato), para que os links já abram na data certa;
 *  4. gera e exibe, ali mesmo, os links de busca pré-preenchidos dos parceiros.
 *
 * Tudo é determinístico e client-side (nenhuma chave externa necessária).
 */

interface Plano {
  intencao: ConciergeIntencao;
  dados: ConciergeParse;
  resumo: string;
  periodo: { depart: string; retorno: string; noites: number };
  voos: ProviderLink[];
  onibus: ProviderLink[];
  hospedagem: ProviderLink[];
  avisos: string[];
}

/** Período padrão quando o usuário não informa datas: começa daqui a 14 dias. */
function periodoPadrao(dados: ConciergeParse): {
  depart: string;
  retorno: string;
  noites: number;
} {
  const depart = dados.departDate ?? addDays(todayInSaoPaulo(), 14);
  const noitesPadrao = 5;
  const retorno = dados.returnDate ?? addDays(depart, noitesPadrao);
  const noites = Math.max(1, Math.round(
    (Date.parse(`${retorno}T00:00:00Z`) - Date.parse(`${depart}T00:00:00Z`)) / 86_400_000
  ) || noitesPadrao);
  return { depart, retorno, noites };
}

function montarPlano(frase: string): Plano | null {
  const dados = interpretarBusca(frase);
  const temAlgo =
    dados.destinationCity || dados.destinationIata || dados.originCity || dados.departDate;
  if (!temAlgo) return null;

  const intencao = inferirIntencao(frase);
  const periodo = periodoPadrao(dados);
  const pax = Math.max(1, dados.passengers ?? 2);
  const avisos: string[] = [];

  const originCity = dados.originCity ?? "";
  const destinationCity = dados.destinationCity ?? "";
  const originIata = (dados.originIata ?? iataDaCidade(originCity) ?? "").toUpperCase();
  const destinationIata = (dados.destinationIata ?? iataDaCidade(destinationCity) ?? "").toUpperCase();

  // --- VOOS: precisam de IATA de origem e destino para deep link preenchido.
  let voos: ProviderLink[] = [];
  if (originIata && destinationIata) {
    voos = buildFlightLinks({
      originCity,
      destinationCity,
      originIata,
      destinationIata,
      departDate: periodo.depart,
      returnDate: periodo.retorno,
      tripType: "round",
      passengers: pax,
      cabin: "economy",
    });
  } else if (destinationCity) {
    avisos.push(
      "Para preços de voo em tempo real, informe as cidades de origem e destino (ou o código IATA). Usei os demais links com o que entendi."
    );
  }

  // --- ÔNIBUS: funcionam com cidades (origem + destino).
  let onibus: ProviderLink[] = [];
  if (originCity && destinationCity) {
    onibus = buildBusLinks({
      originCity,
      destinationCity,
      departDate: periodo.depart,
      returnDate: periodo.retorno,
    });
  }

  // --- HOSPEDAGEM: precisa só da cidade-destino + período.
  let hospedagem: ProviderLink[] = [];
  if (destinationCity) {
    hospedagem = buildStayLinks({
      city: destinationCity,
      checkin: periodo.depart,
      checkout: periodo.retorno,
      guests: pax,
      rooms: 1,
    });
  }

  const partes: string[] = [];
  if (originCity) partes.push(`de ${originCity}`);
  if (destinationCity) partes.push(`para ${destinationCity}`);
  partes.push(`${monthLabel(periodo.depart)}`);
  const resumo =
    (intencao === "hospedagem" ? "Hospedagem " : "Viagem ") +
    partes.join(" ") +
    ` · ${pax} ${pax > 1 ? "pessoas" : "pessoa"}`;

  return { intencao, dados, resumo, periodo, voos, onibus, hospedagem, avisos };
}

function formataData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function ConciergeAgent() {
  const [frase, setFrase] = useState("");
  const [plano, setPlano] = useState<Plano | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function buscar() {
    const p = montarPlano(frase);
    if (!p) {
      setErro(
        'Não consegui entender. Tente algo como "de São Paulo para Recife dia 12/08" ou "hotel em Gramado para 2 pessoas".'
      );
      setPlano(null);
      return;
    }
    setErro(null);
    setPlano(p);
    // Registra a busca (silencioso; degrada se o Supabase não estiver ligado).
    void saveSearch(p.intencao === "hospedagem" ? "hospedagem" : "voo", {
      originCity: p.dados.originCity,
      destinationCity: p.dados.destinationCity,
      departDate: p.periodo.depart,
      returnDate: p.periodo.retorno,
      passengers: p.dados.passengers ?? 2,
    });
  }

  // Ordena as seções conforme a intenção detectada (a principal vem primeiro).
  const ordem: ("voos" | "onibus" | "hospedagem")[] =
    plano?.intencao === "hospedagem"
      ? ["hospedagem", "voos", "onibus"]
      : ["voos", "onibus", "hospedagem"];

  const rotulos: Record<string, { titulo: string; Icone: typeof Plane }> = {
    voos: { titulo: "Voos", Icone: Plane },
    onibus: { titulo: "Ônibus", Icone: Bus },
    hospedagem: { titulo: "Hospedagem", Icone: Hotel },
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-serif text-lg font-semibold text-heading">Concierge de IA</h2>
          <p className="text-xs text-muted">
            Descreva a viagem em uma frase — passagens ou hospedagem — e eu abro as buscas já prontas, no período certo.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={frase}
          onChange={(e) => setFrase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") buscar();
          }}
          placeholder={'Ex.: "de Belo Horizonte para o Rio de 10/07 a 15/07, 2 pessoas"'}
          className="h-11 flex-1 rounded-xl border border-border bg-background px-3.5 text-sm text-heading placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/40"
        />
        <Button type="button" variant="primary" onClick={buscar} disabled={!frase.trim()}>
          <Sparkles className="h-4 w-4" />
          Buscar
        </Button>
      </div>

      {erro && <p className="mt-3 text-xs text-danger">{erro}</p>}

      {plano && (
        <div className="mt-6 space-y-6">
          {/* Resumo do que o agente entendeu */}
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-semibold text-heading">{plano.resumo}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formataData(plano.periodo.depart)} → {formataData(plano.periodo.retorno)} ({plano.periodo.noites} noites)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {plano.dados.passengers ?? 2} {(plano.dados.passengers ?? 2) > 1 ? "pessoas" : "pessoa"}
              </span>
              {!plano.dados.departDate && (
                <span className="text-subtle">Período sugerido — ajuste nos sites se precisar.</span>
              )}
            </div>
          </div>

          {plano.avisos.map((a) => (
            <p key={a} className="text-xs text-muted">{a}</p>
          ))}

          {/* Links pré-preenchidos por categoria */}
          {ordem.map((chave) => {
            const links = plano[chave];
            if (!links || links.length === 0) return null;
            const { titulo, Icone } = rotulos[chave];
            return (
              <section key={chave} className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-heading">
                  <Icone className="h-4 w-4 text-muted" /> {titulo}
                </h3>
                <ProviderLinks title={`Abrir busca pré-preenchida em ${titulo}`} links={links} />
              </section>
            );
          })}

          {plano.voos.length === 0 &&
            plano.onibus.length === 0 &&
            plano.hospedagem.length === 0 && (
              <p className="text-xs text-muted">
                Não consegui montar links com o que entendi. Tente incluir a cidade de destino e, para voos, a de origem.
              </p>
            )}
        </div>
      )}
    </Card>
  );
}
