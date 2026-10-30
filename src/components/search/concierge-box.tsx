"use client";

import { useState } from "react";
import { Sparkles } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  interpretarBusca,
  inferirIntencao,
  type ConciergeParse,
} from "@/lib/concierge";

export type ConciergeModo = "passagens" | "hospedagem";

/**
 * Agente Concierge de linguagem natural — uso GERAL.
 *
 * O usuário descreve a viagem em uma frase (sem escolher "Passagens" ou
 * "Hospedagem"). O concierge extrai origem, destino, datas e passageiros e,
 * quando `comModos` é true (página principal), infere automaticamente a
 * intenção pela frase — menção a hotel/pousada/diárias leva à Hospedagem;
 * caso contrário, à busca de Passagens. O resultado chega via `onInterpretar`.
 *
 * Interpretação determinística (src/lib/concierge.ts): funciona sem chave de IA.
 */
export function ConciergeBox({
  onInterpretar,
  comModos = false,
  exemplo = "Ex.: de Belo Horizonte para o Rio de 10/07 a 15/07, ou \"hotel em Búzios para 2 pessoas\"",
}: {
  onInterpretar: (dados: ConciergeParse, modo: ConciergeModo) => void;
  /** Quando true, infere automaticamente Passagens vs. Hospedagem pela frase. */
  comModos?: boolean;
  exemplo?: string;
}) {
  const [frase, setFrase] = useState("");
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
      setAviso(
        'Não consegui entender. Tente algo como: "de São Paulo para Recife dia 12/08" ou "hotel em Gramado para 2 pessoas".'
      );
      return;
    }
    setAviso(null);
    // Modo geral: a intenção é inferida da frase (não escolhida pelo usuário).
    const modo: ConciergeModo = comModos ? inferirIntencao(frase) : "passagens";
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
            Descreva a viagem em uma frase — passagens ou hospedagem — e eu monto a busca para você.
          </p>
        </div>
      </div>

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
          Buscar
        </Button>
      </div>

      {aviso && <p className="mt-3 text-xs text-danger">{aviso}</p>}
    </Card>
  );
}
