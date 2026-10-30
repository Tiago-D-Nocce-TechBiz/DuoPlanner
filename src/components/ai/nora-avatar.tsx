"use client";

import { cn } from "@/lib/utils";

/**
 * Avatar da Nora: círculo escuro com dois "olhos" minimalistas (traços
 * verticais brancos). Micro-animação sutil de piscar ao passar o mouse
 * (classe `group` no elemento pai) ou continuamente quando `piscando`.
 */
export function NoraAvatar({
  className,
  tamanho = 24,
  piscando = false,
}: {
  className?: string;
  tamanho?: number;
  piscando?: boolean;
}) {
  const olho = Math.max(2, Math.round(tamanho * 0.08));
  const altura = Math.max(6, Math.round(tamanho * 0.34));
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-zinc-950 dark:bg-black shadow-inner shrink-0",
        className
      )}
      style={{ width: tamanho, height: tamanho }}
      aria-hidden
    >
      <span className="flex items-center" style={{ gap: Math.max(2, Math.round(tamanho * 0.12)) }}>
        <span
          className={cn(
            "block rounded-full bg-white origin-center transition-transform duration-200",
            piscando ? "animate-[nora-blink_3.2s_ease-in-out_infinite]" : "group-hover:scale-y-50"
          )}
          style={{ width: olho, height: altura }}
        />
        <span
          className={cn(
            "block rounded-full bg-white origin-center transition-transform duration-200",
            piscando ? "animate-[nora-blink_3.2s_ease-in-out_infinite]" : "group-hover:scale-y-50"
          )}
          style={{ width: olho, height: altura }}
        />
      </span>
    </span>
  );
}
