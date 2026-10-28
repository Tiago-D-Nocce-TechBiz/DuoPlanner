"use client";

import { useRef, useState, useTransition } from "react";
import { ScanLine, Loader2, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanReceiptAction, type ScanResult } from "@/app/dashboard/financas/actions";

/**
 * Interface de captura de despesas:
 * - "Escanear Nota ou Recibo" (ação primária): abre seletor de arquivo e invoca
 *   a Server Action base scanReceiptAction (OCR por IA a ligar futuramente).
 * - "+ Lançamento manual" (ação secundária): placeholder para o formulário
 *   manual de despesa.
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
    // Permite reselecionar o mesmo arquivo depois.
    e.target.value = "";
  }

  return (
    <div className="glass-surface rounded-2xl p-6">
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl border border-sand-border bg-sand-surface p-3">
          <Sparkles className="h-6 w-6 text-heading" />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-xl font-semibold text-heading">
            Despesas sem digitação
          </h2>
          <p className="mt-1.5 text-sm text-foreground">
            Fotografe ou envie uma nota fiscal e deixe a IA extrair o valor, a
            data e o estabelecimento automaticamente.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {/* Ação principal — Espresso profundo */}
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
              Escanear Nota ou Recibo
            </Button>

            {/* Ação secundária */}
            <Button type="button" variant="secondary">
              <Plus className="h-4 w-4" />
              Lançamento manual
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
                (result.ok ? "text-foreground" : "text-red-600")
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
