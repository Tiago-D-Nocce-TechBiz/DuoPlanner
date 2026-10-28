"use client";

import { useRef, useState, useTransition } from "react";
import { ScanLine, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanReceiptAction, type ScanResult } from "@/app/dashboard/financas/actions";

/**
 * Interface do botão "Digitalizar Recibo com IA".
 *
 * Mantém um <input type="file"> oculto e invoca a Server Action base
 * scanReceiptAction. A extração real (OCR por LLM de visão) será ligada na
 * Server Action; aqui só preparamos o fluxo de UI e o estado de resposta.
 */
export function ReceiptScanner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ScanResult | null>(null);

  function onPick() {
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("receipt", file);
    startTransition(async () => {
      const res = await scanReceiptAction(formData);
      setResult(res);
    });
    // Permite re-selecionar o mesmo ficheiro depois.
    e.target.value = "";
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <Sparkles className="h-6 w-6 text-accent" />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-lg font-semibold text-zinc-100">
            Despesas sem digitação
          </h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            Fotografe ou carregue um recibo e deixe a IA extrair o valor, a data
            e o comerciante automaticamente.
          </p>

          <div className="mt-5">
            {/* Botão de ação principal — Amarelo Pastel com texto preto */}
            <Button
              type="button"
              variant="primary"
              onClick={onPick}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
              Digitalizar Recibo com IA
            </Button>

            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          {result && (
            <p
              className={
                "mt-4 text-sm " +
                (result.ok ? "text-zinc-300" : "text-red-400")
              }
            >
              {result.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
