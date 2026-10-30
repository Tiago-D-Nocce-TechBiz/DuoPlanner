"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Avatar da Nora: círculo escuro com dois "olhos" brancos que SEGUEM o cursor
 * do mouse na tela (as pupilas deslizam na direção do ponteiro). Pisca de leve
 * de tempos em tempos. É puramente decorativo (aria-hidden).
 *
 * O rastreamento usa a posição real do avatar na tela (getBoundingClientRect)
 * para calcular o ângulo até o cursor; vários avatares na página seguem o
 * mouse de forma independente e coerente.
 */
export function NoraAvatar({
  className,
  tamanho = 24,
}: {
  className?: string;
  tamanho?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [desloc, setDesloc] = useState({ x: 0, y: 0 });
  const [piscar, setPiscar] = useState(false);

  // Segue o cursor: calcula o vetor do centro do avatar até o mouse e move as
  // pupilas dentro de um raio pequeno.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const ang = Math.atan2(dy, dx);
      const raio = Math.max(1.4, tamanho * 0.09); // deslocamento máximo das pupilas
      setDesloc({ x: Math.cos(ang) * raio, y: Math.sin(ang) * raio });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [tamanho]);

  // Piscada periódica e discreta.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const agendar = () => {
      timeout = setTimeout(() => {
        setPiscar(true);
        setTimeout(() => setPiscar(false), 140);
        agendar();
      }, 2800 + Math.random() * 2600);
    };
    agendar();
    return () => clearTimeout(timeout);
  }, []);

  const olhoW = Math.max(2, Math.round(tamanho * 0.1));
  const olhoH = Math.max(6, Math.round(tamanho * 0.34));
  const gap = Math.max(2, Math.round(tamanho * 0.12));

  return (
    <span
      ref={ref}
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
      <span className="flex items-center" style={{ gap }}>
        <span
          className="nora-eye block rounded-full transition-transform duration-75 ease-out"
          style={{
            width: olhoW,
            height: olhoH,
            transform: `translate(${desloc.x}px, ${desloc.y}px) scaleY(${piscar ? 0.12 : 1})`,
          }}
        />
        <span
          className="nora-eye block rounded-full transition-transform duration-75 ease-out"
          style={{
            width: olhoW,
            height: olhoH,
            transform: `translate(${desloc.x}px, ${desloc.y}px) scaleY(${piscar ? 0.12 : 1})`,
          }}
        />
      </span>
    </span>
  );
}
