"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Rota aérea com avião em 3D real (CSS 3D transforms) — animado e interativo.
 *
 * Comportamento:
 * - Solto: o avião voa automaticamente pela rota (curva bezier), em loop, com
 *   um leve giro orbital que dá vida ao modelo 3D.
 * - Segurando com o mouse (pointer down) e arrastando: você rotaciona o avião
 *   LIVREMENTE em todos os ângulos — horizontal = yaw, vertical = pitch — sem
 *   limites. Ao soltar, a rotação desacelera com inércia e o voo pela rota é
 *   retomado suavemente.
 *
 * Implementação: a rota e a posição vêm de um <path> SVG (getPointAtLength); o
 * avião é um objeto HTML com `transform-style: preserve-3d`, montado a partir
 * de planos (fuselagem, asas, cauda) posicionados no espaço 3D. Sem libs.
 * Respeita prefers-reduced-motion (sem auto-voo; interação continua ativa).
 */

const VIEW_W = 640;
const VIEW_H = 220;
const ROUTE_D = "M 40 150 C 170 40, 300 180, 430 90 C 520 30, 580 110, 610 70";

export function FlightRoute3D({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  // Estado de voo (posição na rota) e de rotação 3D.
  const progress = useRef(0);
  const yaw = useRef(-25); // rotação em torno de Y (horizontal)
  const pitch = useRef(10); // rotação em torno de X (vertical)
  const roll = useRef(0); // inclinação pela tangente da rota
  const spinVel = useRef({ yaw: 0, pitch: 0 }); // inércia ao soltar

  const draggingRef = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const [plane, setPlane] = useState({ x: 48, y: 150, yaw: -25, pitch: 10, roll: 0, alt: 0 });
  const [dragging, setDragging] = useState(false);

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

        // Avança pela rota apenas quando não está sendo arrastado.
        if (!draggingRef.current && !prefersReduced) {
          progress.current = (progress.current + dt * 0.08) % 1;
        }

        const dist = progress.current * total;
        const p = path.getPointAtLength(dist);
        const next = path.getPointAtLength(Math.min(total, dist + 3));
        roll.current = (Math.atan2(next.y - p.y, next.x - p.x) * 180) / Math.PI;
        const alt = Math.sin(progress.current * Math.PI);

        if (draggingRef.current) {
          // Durante o arraste, a rotação vem do mouse (yaw/pitch já atualizados).
        } else {
          // Inércia após soltar + retorno suave a uma pose de cruzeiro.
          yaw.current += spinVel.current.yaw * dt * 60;
          pitch.current += spinVel.current.pitch * dt * 60;
          spinVel.current.yaw *= 0.94;
          spinVel.current.pitch *= 0.94;

          // Giro orbital leve + atração suave para a pose padrão quando parado.
          if (Math.abs(spinVel.current.yaw) < 0.02) {
            yaw.current += dt * 12; // auto-giro vivo
          }
          pitch.current += (10 - pitch.current) * Math.min(1, dt * 1.5);
        }

        setPlane({
          x: p.x,
          y: p.y,
          yaw: yaw.current,
          pitch: pitch.current,
          roll: roll.current,
          alt,
        });
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    lastPointer.current = { x: e.clientX, y: e.clientY };
    spinVel.current = { yaw: 0, pitch: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !lastPointer.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };

    // Arraste livre: horizontal = yaw, vertical = pitch (sem limites → 360°).
    yaw.current += dx * 0.6;
    pitch.current -= dy * 0.6;

    // Guarda a velocidade para dar inércia ao soltar.
    spinVel.current = { yaw: dx * 0.05, pitch: -dy * 0.05 };
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      // pointer já liberado; ignorar.
    }
    draggingRef.current = false;
    setDragging(false);
    lastPointer.current = null;
  };

  // Posição do avião em porcentagem do container (para o nó HTML sobreposto).
  const leftPct = (plane.x / VIEW_W) * 100;
  const topPct = (plane.y / VIEW_H) * 100;
  const scale = 0.92 + plane.alt * 0.18;

  return (
    <div
      ref={wrapRef}
      className={`relative select-none ${className ?? ""}`}
      style={{ perspective: "900px", touchAction: "none" }}
    >
      {/* Dica de interação */}
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-full glass-panel px-3 py-1 text-[10px] font-medium text-[var(--color-muted)]">
        {dragging ? "🕹️ Gire o avião em qualquer ângulo" : "✈️ Segure e arraste o avião para girar em 3D"}
      </div>

      {/* Linha da rota (SVG) */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id="routeGrad3d" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-subtle)" stopOpacity="0.1" />
            <stop offset="50%" stopColor="var(--color-heading)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-subtle)" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <path
          ref={pathRef}
          d={ROUTE_D}
          fill="none"
          stroke="url(#routeGrad3d)"
          strokeWidth="2.5"
          strokeDasharray="7 9"
          strokeLinecap="round"
        />
        <circle cx="40" cy="150" r="5" fill="var(--color-background)" stroke="var(--color-heading)" strokeWidth="2" />
        <circle cx="610" cy="70" r="5" fill="var(--color-background)" stroke="var(--color-heading)" strokeWidth="2" />
        {/* Sombra projetada acompanha o avião */}
        <ellipse
          cx={plane.x}
          cy={plane.y + 14}
          rx={16 * (1 - plane.alt * 0.3)}
          ry={3.4 * (1 - plane.alt * 0.3)}
          fill="var(--color-heading)"
          opacity={Math.max(0.06, 0.26 - plane.alt * 0.14)}
        />
      </svg>

      {/* Avião em CSS 3D sobreposto, posicionado na rota */}
      <div
        className="absolute"
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: "translate(-50%, -50%)",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          className="relative"
          style={{
            width: 72,
            height: 72,
            marginLeft: -36,
            marginTop: -36,
            cursor: dragging ? "grabbing" : "grab",
            transformStyle: "preserve-3d",
            transform: `rotateZ(${plane.roll}deg) rotateY(${plane.yaw}deg) rotateX(${plane.pitch}deg) scale(${scale})`,
            transition: dragging ? "none" : "transform 0.08s linear",
          }}
        >
          <Plane3D />
        </div>
      </div>
    </div>
  );
}

/**
 * Avião montado em planos 3D (fuselagem + asas + estabilizador vertical).
 * Cada plano é um elemento posicionado no espaço com preserve-3d, então a
 * rotação do contêiner o gira de verdade em qualquer ângulo.
 */
function Plane3D() {
  const warm = "var(--color-brand-warm)";
  const teal = "var(--color-brand-teal)";
  const ink = "var(--color-heading)";

  return (
    <div
      className="absolute inset-0"
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* Fuselagem (plano horizontal) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 52,
          height: 14,
          marginLeft: -26,
          marginTop: -7,
          borderRadius: "9999px",
          background: `linear-gradient(90deg, ${warm}, ${teal})`,
          boxShadow: `0 1px 0 ${ink} inset, 0 6px 14px rgba(0,0,0,.35)`,
          transform: "rotateX(90deg)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* nariz claro */}
        <div
          style={{
            position: "absolute",
            right: -4,
            top: 2,
            width: 12,
            height: 10,
            borderRadius: "9999px",
            background: "rgba(255,255,255,.55)",
          }}
        />
      </div>

      {/* Asa principal (plano horizontal, mais larga) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 30,
          height: 52,
          marginLeft: -15,
          marginTop: -26,
          background: `linear-gradient(180deg, #ffffff, ${warm})`,
          clipPath: "polygon(50% 0, 62% 42%, 100% 50%, 62% 58%, 50% 100%, 38% 58%, 0 50%, 38% 42%)",
          transform: "rotateX(90deg) translateZ(0.5px)",
          opacity: 0.98,
        }}
      />

      {/* Estabilizador vertical (plano vertical = cauda) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 18,
          height: 16,
          marginLeft: -24,
          marginTop: -14,
          background: `linear-gradient(180deg, ${teal}, ${ink})`,
          clipPath: "polygon(0 100%, 100% 0, 100% 100%)",
        }}
      />

      {/* Brilho especular geral para leitura 3D */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 52,
          height: 7,
          marginLeft: -26,
          marginTop: -7,
          borderRadius: "9999px",
          background: "rgba(255,255,255,.35)",
          transform: "rotateX(90deg) translateZ(2px)",
          filter: "blur(1px)",
        }}
      />
    </div>
  );
}
