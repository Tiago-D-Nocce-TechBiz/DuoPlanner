"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PlaneEmblem } from "@/components/marketing/plane-emblem";

/**
 * Showcase do avião 3D (Three.js) com uma rota decorativa ao fundo.
 *
 * Carregamento ESTRITAMENTE sob demanda: o pacote 3D (~1 MB de JS + modelo
 * .glb de ~1,9 MB) fica fora do bundle inicial (`next/dynamic`, `ssr: false`)
 * e só é pedido quando:
 *  - o bloco entra na tela E o navegador está ocioso, num aparelho capaz
 *    (WebGL, sem "reduzir movimento", sem economia de dados, memória ≥ 4 GB);
 *  - ou a pessoa toca em "Ver em 3D" (aparelhos limitados ficam no 2D).
 * Até lá, e se o WebGL falhar, aparece o emblema 2D (ErrorBoundary).
 */
const PlaneScene = dynamic(
  () => import("./plane-scene").then((m) => m.PlaneScene),
  {
    ssr: false,
    loading: () => <SceneFallback texto="Carregando modelo 3D…" />,
  }
);

interface NavegadorComExtras extends Navigator {
  connection?: { saveData?: boolean; effectiveType?: string };
  deviceMemory?: number;
}

function suportaWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Aparelho e preferências permitem carregar o 3D sem a pessoa pedir? */
function podeCarregarSozinho(): boolean {
  const nav = navigator as NavegadorComExtras;
  const reduzirMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const economia =
    nav.connection?.saveData === true || /(^|-)2g$/.test(nav.connection?.effectiveType ?? "");
  const memoriaBaixa = typeof nav.deviceMemory === "number" && nav.deviceMemory < 4;
  return !reduzirMovimento && !economia && !memoriaBaixa && suportaWebGL();
}

export function FlightRoute3D({ className }: { className?: string }) {
  const palco = useRef<HTMLDivElement>(null);
  const [modo3d, setModo3d] = useState(false);

  useEffect(() => {
    const elemento = palco.current;
    if (!elemento || !("IntersectionObserver" in window) || !podeCarregarSozinho()) return;

    let cancelado = false;
    let idle: number | null = null;
    let timer: number | null = null;
    const carregar = () => {
      if (!cancelado) setModo3d(true);
    };

    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        observador.disconnect();
        // Safari ainda não tem requestIdleCallback: cai num atraso curto.
        if (typeof window.requestIdleCallback === "function") {
          idle = window.requestIdleCallback(carregar, { timeout: 2500 });
        } else {
          timer = window.setTimeout(carregar, 1200);
        }
      },
      { rootMargin: "120px" }
    );
    observador.observe(elemento);

    return () => {
      cancelado = true;
      observador.disconnect();
      if (idle !== null) window.cancelIdleCallback(idle);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

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

      {/* Palco: 2D até o 3D ser pedido ou o navegador ficar ocioso */}
      <div ref={palco} className="relative z-[1] h-full w-full">
        {modo3d ? (
          <ErrorBoundary fallback={<SceneFallback />}>
            <Suspense fallback={<SceneFallback texto="Carregando modelo 3D…" />}>
              <PlaneScene />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <PlaneEmblem className="h-24 w-24" />
            <button
              type="button"
              onClick={() => setModo3d(true)}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-medium text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:border-[var(--color-border-strong)] transition-colors cursor-pointer"
            >
              Ver o avião em 3D
            </button>
          </div>
        )}
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
