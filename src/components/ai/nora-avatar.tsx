"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { proximoAtrasoDePiscada, registrarOlhar } from "./nora-olhar";

/**
 * Avatar da Nora: círculo com dois "olhos" que seguem o cursor e piscam de
 * leve. É puramente decorativo (aria-hidden).
 *
 * O rastreamento fica em `./nora-olhar` (um listener para todos os avatares,
 * escrevendo o transform direto no DOM, sem re-render do React). A piscada é
 * só CSS (`.nora-eye-piscar`), com atraso diferente por avatar.
 */
export function NoraAvatar({
  className,
  tamanho = 24,
}: {
  className?: string;
  tamanho?: number;
}) {
  const faceRef = useRef<HTMLSpanElement>(null);
  const olhosRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const face = faceRef.current;
    const olhos = olhosRef.current;
    if (!face || !olhos) return;
    olhos.style.setProperty("--nora-piscar-atraso", `${proximoAtrasoDePiscada()}s`);
    // Deslocamento máximo das pupilas.
    return registrarOlhar(face, olhos, Math.max(1.4, tamanho * 0.09));
  }, [tamanho]);

  const olhoW = Math.max(2, Math.round(tamanho * 0.1));
  const olhoH = Math.max(6, Math.round(tamanho * 0.34));
  const gap = Math.max(2, Math.round(tamanho * 0.12));

  return (
    <span
      ref={faceRef}
      className={cn(
        // Cores controladas por .nora-face / .nora-eye no globals.css, que
        // respondem à classe .dark do tema (o dark: do Tailwind aqui seguiria
        // o SO, não o tema do app).
        "nora-face relative inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden",
        className
      )}
      style={{ width: tamanho, height: tamanho }}
      aria-hidden
    >
      <span
        ref={olhosRef}
        className="flex items-center transition-transform duration-75 ease-out"
        style={{ gap }}
      >
        <span className="nora-eye nora-eye-piscar block rounded-full" style={{ width: olhoW, height: olhoH }} />
        <span className="nora-eye nora-eye-piscar block rounded-full" style={{ width: olhoW, height: olhoH }} />
      </span>
    </span>
  );
}
