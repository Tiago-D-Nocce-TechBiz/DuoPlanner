"use client";

import { useEffect, useRef, useState } from "react";

interface Pose {
  x: number;
  y: number;
  angle: number;
  /** Altitude relativa (0 nas pontas, 1 no meio) para o efeito 3D. */
  altitude: number;
}

/**
 * Rota aérea animada com avião em 3D (decorativa, sem interação).
 *
 * O avião percorre automaticamente uma curva (bezier) em loop suave, inclinando
 * a proa conforme a tangente da rota. A sensação tridimensional vem de:
 * - gradiente de volume no corpo (claro em cima, escuro embaixo);
 * - sombra projetada na "pista" abaixo, que acompanha o voo;
 * - leve escala/altitude variando ao longo da rota (parábola).
 *
 * Usa requestAnimationFrame e getPointAtLength do próprio <path>, então é leve
 * e não depende de bibliotecas 3D. Respeita prefers-reduced-motion.
 */
export function FlightRoute3D({ className }: { className?: string }) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const progressRef = useRef<number>(0);
  const [pose, setPose] = useState<Pose>({ x: 40, y: 150, angle: 0, altitude: 0 });

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const path = pathRef.current;
      if (path) {
        const total = path.getTotalLength();
        // Velocidade constante; para quem prefere menos movimento, fica parado
        // num ponto agradável da rota.
        if (!prefersReduced) {
          progressRef.current = (progressRef.current + dt * 0.08) % 1;
        } else {
          progressRef.current = 0.35;
        }

        const dist = progressRef.current * total;
        const p = path.getPointAtLength(dist);
        const next = path.getPointAtLength(Math.min(total, dist + 3));
        const angle = (Math.atan2(next.y - p.y, next.x - p.x) * 180) / Math.PI;
        const altitude = Math.sin(progressRef.current * Math.PI);

        setPose({ x: p.x, y: p.y, angle, altitude });
      }

      if (!prefersReduced) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Deriva a leitura 3D (escala/sombra) da altitude já calculada no tick,
  // sem acessar refs durante o render.
  const { altitude } = pose;
  const planeScale = 0.9 + altitude * 0.22;
  const shadowOffset = 10 + altitude * 16;
  const shadowOpacity = 0.28 - altitude * 0.16;
  const shadowScale = 1 - altitude * 0.3;

  return (
    <div className={className}>
      <svg
        viewBox="0 0 640 220"
        className="w-full h-full overflow-visible"
        role="img"
        aria-label="Avião voando por uma rota, animação decorativa"
      >
        <defs>
          {/* Volume do corpo do avião (topo claro, base escura) */}
          <linearGradient id="planeBody3d" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="45%" stopColor="var(--color-brand-warm)" />
            <stop offset="100%" stopColor="var(--color-brand-teal)" />
          </linearGradient>
          <linearGradient id="routeGrad3d" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-subtle)" stopOpacity="0.1" />
            <stop offset="50%" stopColor="var(--color-heading)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-subtle)" stopOpacity="0.1" />
          </linearGradient>
          <filter id="planeDrop" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Rota pontilhada de referência (perspectiva sutil) */}
        <path
          ref={pathRef}
          d="M 40 150 C 170 40, 300 180, 430 90 C 520 30, 580 110, 610 70"
          fill="none"
          stroke="url(#routeGrad3d)"
          strokeWidth="2.5"
          strokeDasharray="7 9"
          strokeLinecap="round"
        />

        {/* Ponto de partida e destino */}
        <circle cx="40" cy="150" r="5" fill="var(--color-background)" stroke="var(--color-heading)" strokeWidth="2" />
        <circle cx="610" cy="70" r="5" fill="var(--color-background)" stroke="var(--color-heading)" strokeWidth="2" />

        {/* Sombra projetada do avião na "pista" (dá profundidade 3D) */}
        <ellipse
          cx={pose.x}
          cy={pose.y + shadowOffset}
          rx={16 * shadowScale}
          ry={3.4 * shadowScale}
          fill="var(--color-heading)"
          opacity={Math.max(0.06, shadowOpacity)}
        />

        {/* Avião com volume, inclinando pela tangente e com leve escala 3D */}
        <g
          transform={`translate(${pose.x}, ${pose.y}) rotate(${pose.angle}) scale(${planeScale})`}
          filter="url(#planeDrop)"
        >
          {/* asa de trás (mais escura, atrás do corpo) */}
          <path
            d="M -6 0 L -14 7 L -9 7 Z"
            fill="var(--color-brand-teal)"
            opacity="0.85"
          />
          {/* corpo + asas principais */}
          <path
            d="M 16 0 L 4 -2.4 L -3 -13 L -7 -13 L -3.5 -2.4 L -11 -2.4 L -14 -7 L -17 -7 L -14.5 0 L -17 7 L -14 7 L -11 2.4 L -3.5 2.4 L -7 13 L -3 13 L 4 2.4 Z"
            fill="url(#planeBody3d)"
            stroke="var(--color-heading)"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          {/* brilho especular no topo (reforça o 3D) */}
          <path
            d="M 16 0 L 4 -2.4 L -3 -13 L -7 -13 L -3.5 -2.4 Z"
            fill="#ffffff"
            opacity="0.3"
          />
        </g>
      </svg>
    </div>
  );
}
