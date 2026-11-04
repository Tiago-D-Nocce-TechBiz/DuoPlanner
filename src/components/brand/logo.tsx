import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo oficial do DuoPlanner — o ÚNICO componente de marca do app (o antigo
 * `ui/logo.tsx`, só tipográfico, foi removido).
 *
 * A marca definitiva é o monograma "PD" com o avião em ascensão e o gráfico
 * de crescimento. O arquivo-fonte fica em `public/brand/logo.png`; a
 * interface usa as versões WebP otimizadas (`logo-96.webp`, `logo-192.webp`)
 * e o PWA usa os ícones de `public/icons/`, todos gerados a partir dele.
 *
 * O ícone degrada com elegância: se a imagem falhar, o símbolo vetorial de
 * reserva (`BrandIconFallback`) aparece por baixo e o build nunca quebra.
 */

// Versões otimizadas geradas a partir de `public/brand/logo.png` (1,45 MB,
// 1254 px — o arquivo-fonte da marca, que não é mais baixado pela interface).
// O ícone aparece a 32 px: 96 px (1,7 KB) cobre telas 1x; 192 px, as 2x/3x.
// O sufixo `?v=` força o navegador a buscar a imagem nova; incremente-o
// sempre que a logo for trocada (e gere os arquivos de novo).
const LOGO_SRC = "/brand/logo-96.webp?v=3";
const LOGO_SRCSET = "/brand/logo-96.webp?v=3 1x, /brand/logo-192.webp?v=3 2x";

/** Símbolo vetorial de reserva, exibido se o PNG ainda não foi salvo. */
function BrandIconFallback({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="DuoPlanner"
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
    <span
      className={cn(
        "relative inline-block h-8 w-8 shrink-0 overflow-hidden rounded-xl",
        className,
      )}
    >
      <BrandIconFallback className="absolute inset-0 h-full w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_SRC}
        srcSet={LOGO_SRCSET}
        alt="DuoPlanner"
        width={32}
        height={32}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}

/**
 * Logotipo completo: ícone + wordmark "DuoPlanner".
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
        DuoPlanner
      </span>
    </span>
  );

  if (href === null) return conteudo;
  return (
    <Link href={href} aria-label="DuoPlanner — início" className="inline-flex">
      {conteudo}
    </Link>
  );
}
