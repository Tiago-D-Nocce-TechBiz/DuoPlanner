"use client";

import React, { useEffect, useRef, useState } from "react";

interface Point {
  x: number;
  y: number;
}

/**
 * Rota Aérea Interativa da Landing Page.
 *
 * O avião percorre automaticamente uma rota (bezier) entre "Partida" e
 * "Buscar Passagens". O usuário pode segurar o avião com o mouse, arrastá-lo e
 * girá-lo em 360°; ao soltar, ele retoma suavemente o ponto mais próximo da
 * rota e segue o percurso.
 */
export function InteractiveFlightRoute() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  const progressRef = useRef<number>(0.12);
  const [planePos, setPlanePos] = useState<Point>({ x: 180, y: 70 });
  const [planeAngle, setPlaneAngle] = useState<number>(15);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isReturning, setIsReturning] = useState<boolean>(false);

  const dragPosRef = useRef<Point>({ x: 180, y: 70 });
  const dragAngleRef = useRef<number>(15);
  const lastPointerRef = useRef<Point | null>(null);

  const clientToSvgPoint = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 500, y: 95 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 1000;
    const y = ((clientY - rect.top) / rect.height) * 190;
    return {
      x: Math.max(24, Math.min(976, x)),
      y: Math.max(18, Math.min(172, y)),
    };
  };

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const pathEl = pathRef.current;
      if (pathEl) {
        const totalLength = pathEl.getTotalLength();

        if (!isDragging) {
          progressRef.current = (progressRef.current + dt * 0.075) % 1;

          const currentDist = progressRef.current * totalLength;
          const nextDist = Math.min(totalLength, currentDist + 4);

          const pt = pathEl.getPointAtLength(currentDist);
          const nextPt = pathEl.getPointAtLength(nextDist);

          const targetAngle =
            (Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x) * 180) / Math.PI;

          if (isReturning) {
            const lerpFactor = Math.min(1, dt * 8);
            const newX =
              dragPosRef.current.x + (pt.x - dragPosRef.current.x) * lerpFactor;
            const newY =
              dragPosRef.current.y + (pt.y - dragPosRef.current.y) * lerpFactor;

            const angleDiff = ((targetAngle - dragAngleRef.current + 540) % 360) - 180;
            const newAngle = dragAngleRef.current + angleDiff * lerpFactor;

            dragPosRef.current = { x: newX, y: newY };
            dragAngleRef.current = newAngle;

            setPlanePos({ x: newX, y: newY });
            setPlaneAngle(newAngle);

            const distRemaining = Math.hypot(pt.x - newX, pt.y - newY);
            if (distRemaining < 3.5) {
              setIsReturning(false);
            }
          } else {
            dragPosRef.current = { x: pt.x, y: pt.y };
            dragAngleRef.current = targetAngle;
            setPlanePos({ x: pt.x, y: pt.y });
            setPlaneAngle(targetAngle);
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isDragging, isReturning]);

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const pt = clientToSvgPoint(e.clientX, e.clientY);
    lastPointerRef.current = pt;
    setIsReturning(false);
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    const pt = clientToSvgPoint(e.clientX, e.clientY);
    const prev = lastPointerRef.current || dragPosRef.current;

    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;

    if (Math.hypot(dx, dy) > 0.8) {
      const manualAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      dragAngleRef.current = manualAngle;
      setPlaneAngle(manualAngle);
      lastPointerRef.current = pt;
    }

    dragPosRef.current = pt;
    setPlanePos(pt);
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    const pathEl = pathRef.current;
    if (pathEl) {
      const total = pathEl.getTotalLength();
      let bestProgress = progressRef.current;
      let minDistance = Infinity;

      const samples = 60;
      for (let i = 0; i <= samples; i++) {
        const p = i / samples;
        const samplePt = pathEl.getPointAtLength(p * total);
        const d = Math.hypot(
          samplePt.x - dragPosRef.current.x,
          samplePt.y - dragPosRef.current.y
        );
        if (d < minDistance) {
          minDistance = d;
          bestProgress = p;
        }
      }
      progressRef.current = bestProgress;
    }

    setIsDragging(false);
    setIsReturning(true);
    lastPointerRef.current = null;
  };

  return (
    <div className="relative mx-auto w-full max-w-6xl my-4 sm:my-6 select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 mb-1">
        <div className="inline-flex items-center gap-2 rounded-full glass-panel px-3.5 py-1 text-[11px] font-medium text-[var(--color-muted)]">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            {isDragging
              ? `Controle manual ativo • Proa ${Math.round(
                  (planeAngle + 360) % 360
                )}° (Solte o mouse para retomar a rota)`
              : "Segure e arraste o avião com o mouse para girar e pilotar"}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-4 text-[11px] font-mono tracking-wider text-[var(--color-subtle)]">
          <span>ORIGEM: CNF 19°37&apos;S</span>
          <span>•</span>
          <span>ROTA DUO ATIVA</span>
          <span>•</span>
          <span>DESTINO: CFB / BÚZIOS 22°45&apos;S</span>
        </div>
      </div>

      <div className="relative w-full overflow-visible">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 190"
          className="w-full h-36 sm:h-44 overflow-visible"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <defs>
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--color-subtle)" stopOpacity="0.15" />
              <stop offset="25%" stopColor="var(--color-heading)" stopOpacity="0.55" />
              <stop offset="75%" stopColor="var(--color-heading)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--color-subtle)" stopOpacity="0.15" />
            </linearGradient>

            <filter id="planeShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodOpacity="0.22" />
            </filter>
          </defs>

          <path
            d="M 40 145 C 240 20, 420 175, 620 65 C 770 -5, 870 155, 960 55"
            fill="none"
            stroke="var(--color-border-strong)"
            strokeWidth="1"
            strokeDasharray="3 7"
            opacity="0.45"
          />

          <path
            d="M 55 45 C 250 175, 430 10, 610 120 C 760 205, 860 35, 945 130"
            fill="none"
            stroke="url(#routeGradient)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.12"
          />

          <path
            ref={pathRef}
            d="M 55 45 C 250 175, 430 10, 610 120 C 760 205, 860 35, 945 130"
            fill="none"
            stroke="url(#routeGradient)"
            strokeWidth="2.5"
            strokeDasharray="8 8"
            strokeLinecap="round"
          />

          {isDragging && (
            <circle
              cx={planePos.x}
              cy={planePos.y}
              r="34"
              fill="none"
              stroke="var(--color-heading)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.45"
            />
          )}

          <g transform="translate(55, 45)">
            <circle r="6" fill="var(--color-background)" stroke="var(--color-heading)" strokeWidth="2" />
            <circle r="2.5" fill="var(--color-heading)" />
            <text
              x="12"
              y="-10"
              className="text-[10px] font-semibold fill-[var(--color-muted)]"
            >
              Partida
            </text>
          </g>

          <g transform="translate(505, 68)">
            <circle r="5" fill="var(--color-background)" stroke="var(--color-subtle)" strokeWidth="2" />
            <text
              x="-32"
              y="-12"
              className="text-[10px] font-medium fill-[var(--color-subtle)]"
            >
              Cruzeiro Duo
            </text>
          </g>

          <g transform="translate(945, 130)">
            <circle r="6" fill="var(--color-background)" stroke="var(--color-heading)" strokeWidth="2" />
            <circle r="2.5" fill="var(--color-heading)" />
            <text
              x="-65"
              y="22"
              className="text-[10px] font-semibold fill-[var(--color-muted)]"
            >
              Buscar Passagens
            </text>
          </g>

          <g
            transform={`translate(${planePos.x}, ${planePos.y}) rotate(${planeAngle})`}
            onPointerDown={handlePointerDown}
            style={{
              cursor: isDragging ? "grabbing" : "grab",
              touchAction: "none",
            }}
            filter="url(#planeShadow)"
          >
            <circle r="28" fill="transparent" />

            <circle
              r={isDragging ? "22" : "17"}
              fill="var(--color-card)"
              stroke="var(--color-border-strong)"
              strokeWidth={isDragging ? "2" : "1.2"}
            />

            <path
              d="M -26 0 L -14 0"
              stroke="var(--color-heading)"
              strokeWidth="2"
              strokeLinecap="round"
              opacity={isDragging ? "0.85" : "0.4"}
            />

            <path
              d="M 11 0 L 3 -2.2 L -2 -11 L -5.5 -11 L -2.8 -2.2 L -8.5 -2.2 L -11 -6 L -13 -6 L -11.2 0 L -13 6 L -11 6 L -8.5 2.2 L -2.8 2.2 L -5.5 11 L -2 11 L 3 2.2 Z"
              fill="var(--color-heading)"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
