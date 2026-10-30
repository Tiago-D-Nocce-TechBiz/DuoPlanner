import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo oficial do PlannerDuo.
 *
 * A marca definitiva é uma imagem (PNG) em `public/brand/logo.png` — o
 * monograma "PD" com o avião em ascensão e o gráfico de crescimento.
 *
 * Como a imagem é um arquivo que o mantenedor salva manualmente (igual ao
 * modelo 3D `public/models/aviao.glb`), o ícone degrada com elegância: se o
 * PNG ainda não existir, o símbolo vetorial de reserva (`BrandIconFallback`)
 * aparece por baixo e o build nunca quebra. Quando a imagem existe, ela cobre
 * totalmente o fallback.
 *
 * Caminho esperado do arquivo: `public/brand/logo.png`
 * (recomendado: PNG quadrado com fundo transparente, >= 256x256).
 */

const LOGO_SRC = "/brand/logo.png";

/** Símbolo vetorial de reserva, exibido se o PNG ainda não foi salvo. */
function BrandIconFallback({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="PlannerDuo"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="pdBrandGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-warm)" />
          <stop offset="100%" stopColor="var(--color-brand-teal)" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#pdBrandGrad)" />

      <path
        d="M24 10 L33 24 L24 21 L15 24 Z"
        fill="var(--color-accent-foreground)"
        opacity="0.95"
      />
      <path
        d="M24 38 L15 24 L24 27 L33 24 Z"
        fill="var(--color-accent-foreground)"
        opacity="0.72"
      />

      <circle cx="24" cy="24" r="2.6" fill="url(#pdBrandGrad)" />
      <circle
        cx="24"
        cy="24"
        r="2.6"
        fill="none"
        stroke="var(--color-accent-foreground)"
        strokeWidth="1.1"
      />

      <path
        d="M11 37 L37 11"
        stroke="var(--color-accent-foreground)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeDasharray="0.2 3.4"
        opacity="0.6"
      />
    </svg>
  );
}

/**
 * Ícone da marca: a imagem PNG oficial sobre o fallback vetorial.
 *
 * Usamos `<img>` nativo (não `next/image`) de propósito: o caminho é estático
 * e servido direto de `public/`, e assim o build não falha caso o arquivo
 * ainda não tenha sido salvo. Se a imagem falhar ao carregar, ela fica
 * invisível e o SVG de reserva — posicionado por baixo — aparece.
 */
export function BrandIcon({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block h-8 w-8 shrink-0", className)}>
      <BrandIconFallback className="absolute inset-0 h-full w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_SRC}
        alt="PlannerDuo"
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}

/**
 * Logotipo completo: ícone + wordmark "PlannerDuo".
 * `href` torna-o clicável (padrão: início). Passe `href={null}` para usar só
 * como marca estática (ex.: quando a logo abre um modal de sair).
 */
export function BrandLogo({
  href = "/",
  className,
  iconClassName,
}: {
  href?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  const conteudo = (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandIcon className={cn("h-8 w-8", iconClassName)} />
      <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-heading)]">
        PlannerDuo
      </span>
    </span>
  );

  if (href === null) return conteudo;
  return (
    <Link href={href} aria-label="PlannerDuo — início" className="inline-flex">
      {conteudo}
    </Link>
  );
}
