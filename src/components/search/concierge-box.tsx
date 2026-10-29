"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { interpretarBusca, type ConciergeParse } from "@/lib/concierge";

/**
 * Agente Concierge de IA (linguagem natural).
 *
 * O usuário descreve a viagem em uma frase e o concierge extrai origem,
 * destino, datas e passageiros, entregando o resultado via `onInterpretar`
 * para a tela de busca preencher os campos automaticamente.
 *
 * A interpretação é determinística (src/lib/concierge.ts), então funciona sem
 * depender de chave de IA. Um LLM pode ser plugado depois para frases livres.
 */
export function ConciergeBox({
  onInterpretar,
  exemplo = "Ex.: quero ir de Belo Horizonte para o Rio de Janeiro de 10/07 a 15/07, 2 pessoas",
}: {
  onInterpretar: (dados: ConciergeParse) => void;
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
      setAviso("Não consegui entender. Tente algo como: “de São Paulo para Recife dia 12/08”.");
      return;
    }
    setAviso("Preenchi o formulário com o que entendi. Confira e ajuste se precisar.");
    onInterpretar(dados);
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-serif text-lg font-semibold text-heading">Concierge de IA</h2>
          <p className="text-xs text-muted">Descreva a viagem em uma frase e eu preencho a busca.</p>
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
          Interpretar
        </Button>
      </div>

      {aviso && <p className="mt-3 text-xs text-muted">{aviso}</p>}
    </Card>
  );
}
