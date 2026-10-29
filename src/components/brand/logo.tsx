import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Ícone e logotipo originais do PlannerDuo.
 *
 * Conceito do símbolo (desenho próprio, não baseado em marca existente):
 * - Um losango/pino de mapa (viagem) formado por dois triângulos espelhados,
 *   que também sugerem a "dupla" (duo) e a cauda de um avião em ascensão.
 * - Uma trilha pontilhada diagonal cruza o símbolo (a rota da viagem).
 * - No centro, um ponto que remete a uma moeda/indicador financeiro.
 * Cores vêm das variáveis de tema (warm → teal), então funciona em claro e
 * escuro. É um ícone único, reutilizado em todo o sistema.
 */

export function BrandIcon({ className }: { className?: string }) {
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

      {/* Base arredondada do ícone */}
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#pdBrandGrad)" />

      {/* Pino de mapa / "duo": dois triângulos espelhados que formam um losango,
          também lembrando asas/cauda de avião em ascensão. */}
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

      {/* Ponto central = moeda / indicador financeiro */}
      <circle cx="24" cy="24" r="2.6" fill="url(#pdBrandGrad)" />
      <circle
        cx="24"
        cy="24"
        r="2.6"
        fill="none"
        stroke="var(--color-accent-foreground)"
        strokeWidth="1.1"
      />

      {/* Trilha da rota (pontilhada diagonal) */}
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
      <BrandIcon className={cn("h-8 w-8 shrink-0", iconClassName)} />
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
