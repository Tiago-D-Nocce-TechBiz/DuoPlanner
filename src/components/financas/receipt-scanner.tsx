"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  ScanLine,
  Sparkles,
} from "@/components/ui/icons";
import {
  processReceiptImage,
  type ReceiptScanResult,
} from "@/app/dashboard/financas/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDateBR } from "@/lib/utils";

/**
 * Captura de despesas com IA (Finanças Duo).
 *
 * "Escanear Recibo com IA" abre a câmera/galeria, reduz a foto no navegador e
 * envia o base64 para a Server Action `processReceiptImage`, que extrai
 * { titulo, valor, data } com o Gemini e já grava a despesa no Supabase.
 */

const MAX_DIMENSION = 1600; // px no maior lado: legível para OCR e leve para enviar
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

async function prepareReceipt(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("PDF grande demais (máximo de 6 MB).");
    return readAsDataUrl(file);
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponível.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    // Formatos que o navegador não decodifica (ex.: HEIC fora do Safari) vão como estão.
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Imagem grande demais (máximo de 6 MB).");
    return readAsDataUrl(file);
  }
}

export function ReceiptScanner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptScanResult | null>(null);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;

    setFileName(file.name);
    setResult(null);
    startTransition(async () => {
      let next: ReceiptScanResult;
      try {
        next = await processReceiptImage(await prepareReceipt(file));
      } catch (error) {
        next = {
          ok: false,
          message: error instanceof Error ? error.message : "Não foi possível ler o arquivo.",
        };
      }
      startTransition(() => setResult(next));
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-elevated">
            <Sparkles className="h-5 w-5 text-heading" />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold">Despesas sem digitação</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-foreground">
              Fotografe uma nota fiscal ou recibo: a IA lê o título, o valor e a
              data e registra a despesa da dupla automaticamente.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScanLine className="h-4 w-4" />
            )}
            {pending ? "Lendo recibo…" : "Escanear Recibo com IA"}
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled title="Em breve">
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
      </div>

      <div aria-live="polite">
        {pending && (
          <p className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-background p-4 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lendo {fileName ?? "o recibo"} com o Gemini…
          </p>
        )}

        {!pending && result?.ok && (
          <div className="mt-6 rounded-xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium text-heading">
                <CheckCircle2 className="h-4 w-4" />
                {result.message}
              </p>
              <Badge variant={result.salvo ? "accent" : "outline"}>
                {result.salvo ? "Salvo no Supabase" : "Não salvo"}
              </Badge>
            </div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-subtle">Título</dt>
                <dd className="mt-1 text-heading">{result.despesa.titulo}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Valor</dt>
                <dd className="mt-1 font-semibold tabular-nums text-heading">
                  {formatCurrency(result.despesa.valor, result.despesa.moeda)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Data</dt>
                <dd className="mt-1 text-heading">{formatDateBR(result.despesa.data)}</dd>
              </div>
            </dl>
            {result.avisos.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {result.avisos.map((aviso) => (
                  <li key={aviso} className="flex items-start gap-2 text-xs text-muted">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {aviso}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!pending && result && !result.ok && (
          <p className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-background p-4 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {result.message}
          </p>
        )}
      </div>

      <p className="mt-5 text-xs text-subtle">
        A imagem vai para o Google Gemini só para leitura e não fica armazenada.
        Aceita JPG, PNG, WEBP, HEIC ou PDF (até 6 MB).
      </p>
    </Card>
  );
}
