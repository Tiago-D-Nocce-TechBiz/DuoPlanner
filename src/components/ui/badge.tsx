import { cn } from "@/lib/utils";

/**
 * Badge compacto.
 * - "accent": amarelo pastel com texto preto. Reservado para destaques vitais
 *   (ex.: melhor custo-benefício, combinação low-cost).
 * - "neutral": chip zinc para metadados.
 * - "outline": apenas contorno, para rótulos discretos.
 */
type Variant = "accent" | "neutral" | "outline";

const variants: Record<Variant, string> = {
  accent: "bg-accent text-accent-foreground",
  neutral: "bg-elevated text-heading",
  outline: "border border-border text-muted",
};

export function Badge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
