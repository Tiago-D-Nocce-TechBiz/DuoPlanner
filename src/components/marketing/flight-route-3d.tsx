"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PlaneEmblem } from "@/components/marketing/plane-emblem";

/**
 * Showcase do avião 3D realista (Three.js) com uma rota decorativa ao fundo.
 *
 * A cena WebGL é carregada só no cliente (dynamic import, ssr: false) e
 * protegida por Suspense + ErrorBoundary: se o WebGL não estiver disponível
 * (navegador antigo, GPU bloqueada), caímos no emblema 2D sem quebrar a página.
 *
 * Interação: segure e arraste para girar o avião livremente em todos os
 * ângulos; ocioso, ele gira sozinho com leve balanço.
 */
const PlaneScene = dynamic(
  () => import("./plane-scene").then((m) => m.PlaneScene),
  {
    ssr: false,
    loading: () => <SceneFallback texto="Carregando modelo 3D…" />,
  }
);

export function FlightRoute3D({ className }: { className?: string }) {
  return (
    <div className={`relative select-none ${className ?? ""}`}>
      {/* Rota decorativa ao fundo (SVG estático) */}
      <svg
        viewBox="0 0 640 220"
        className="absolute inset-0 h-full w-full overflow-visible opacity-70"
        aria-hidden
      >
        <defs>
          <linearGradient id="routeGradShow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-subtle)" stopOpacity="0.1" />
            <stop offset="50%" stopColor="var(--color-heading)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--color-subtle)" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <path
          d="M 40 170 C 180 60, 300 190, 430 100 C 520 42, 580 120, 610 80"
          fill="none"
          stroke="url(#routeGradShow)"
          strokeWidth="2"
          strokeDasharray="6 10"
          strokeLinecap="round"
        />
        <circle cx="40" cy="170" r="5" fill="var(--color-background)" stroke="var(--color-heading)" strokeWidth="2" />
        <circle cx="610" cy="80" r="5" fill="var(--color-background)" stroke="var(--color-heading)" strokeWidth="2" />
      </svg>

      {/* Dica de interação */}
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-full glass-panel px-3 py-1 text-[10px] font-medium text-[var(--color-muted)]">
        ✈️ Segure e arraste para girar o avião em 3D
      </div>

      {/* Palco 3D */}
      <div className="relative z-[1] h-full w-full">
        <ErrorBoundary fallback={<SceneFallback />}>
          <Suspense fallback={<SceneFallback texto="Carregando modelo 3D…" />}>
            <PlaneScene />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

/** Fallback visual (loading ou WebGL indisponível): emblema 2D elegante. */
function SceneFallback({ texto }: { texto?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <PlaneEmblem className="h-24 w-24 animate-pulse" />
      {texto && (
        <span className="text-[10px] font-medium text-[var(--color-subtle)]">
          {texto}
        </span>
      )}
    </div>
  );
}
