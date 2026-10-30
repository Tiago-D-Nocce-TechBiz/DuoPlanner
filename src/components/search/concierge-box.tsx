"use client";

import { useState } from "react";
import { Sparkles, Plane, Hotel } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { interpretarBusca, type ConciergeParse } from "@/lib/concierge";
import { cn } from "@/lib/utils";

export type ConciergeModo = "passagens" | "hospedagem";

/**
 * Agente Concierge de linguagem natural.
 *
 * O usuário descreve a viagem em uma frase; o concierge extrai origem, destino,
 * datas e passageiros e entrega via `onInterpretar`. Quando `comModos` é true,
 * mostra a escolha Passagens/Hospedagem e informa o modo escolhido — útil na
 * página principal para decidir para onde levar o usuário.
 *
 * Interpretação determinística (src/lib/concierge.ts): funciona sem chave de IA.
 */
export function ConciergeBox({
  onInterpretar,
  comModos = false,
  exemplo = "Ex.: quero ir de Belo Horizonte para o Rio de Janeiro de 10/07 a 15/07, 2 pessoas",
}: {
  onInterpretar: (dados: ConciergeParse, modo: ConciergeModo) => void;
  comModos?: boolean;
  exemplo?: string;
}) {
  const [frase, setFrase] = useState("");
  const [modo, setModo] = useState<ConciergeModo>("passagens");
  const [aviso, setAviso] = useState<string | null>(null);

  function interpretar() {
    const dados = interpretarBusca(frase);
    const achouAlgo =
      dados.originCity ||
      dados.originIata ||
      dados.destinationCity ||
      dados.destinationIata ||
      dados.departDate;
    if (!achouAlgo) {
      setAviso('Não consegui entender. Tente algo como: "de São Paulo para Recife dia 12/08".');
      return;
    }
    setAviso(null);
    onInterpretar(dados, modo);
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-serif text-lg font-semibold text-heading">Concierge de IA</h2>
          <p className="text-xs text-muted">
            Descreva a viagem em uma frase e eu monto a busca para você.
          </p>
        </div>
      </div>

      {comModos && (
        <div
          role="radiogroup"
          aria-label="Buscar o quê"
          className="mb-3 inline-flex rounded-xl border border-border bg-background p-1"
        >
          {([
            { key: "passagens", label: "Passagens", icon: Plane },
            { key: "hospedagem", label: "Hospedagem", icon: Hotel },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={modo === t.key}
              onClick={() => setModo(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm transition-colors",
                modo === t.key ? "bg-elevated font-medium text-heading" : "text-muted hover:text-heading"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={frase}
          onChange={(e) => setFrase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") interpretar();
          }}
          placeholder={exemplo}
          className="h-11 flex-1 rounded-xl border border-border bg-background px-3.5 text-sm text-heading placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/40"
        />
        <Button type="button" variant="primary" onClick={interpretar} disabled={!frase.trim()}>
          <Sparkles className="h-4 w-4" />
          {comModos ? "Buscar" : "Interpretar"}
        </Button>
      </div>

      {aviso && <p className="mt-3 text-xs text-danger">{aviso}</p>}
    </Card>
  );
}
