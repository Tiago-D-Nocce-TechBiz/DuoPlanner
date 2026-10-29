import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Marca do PlannerDuo: "Planner" em Playfair (zinc-100) + "Duo" em itálico
 * zinc-400. O acento amarelo fica reservado para ações, então a marca é
 * monocromática.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-serif text-2xl font-semibold tracking-tight text-heading",
        className
      )}
    >
      Planner<span className="font-normal italic text-muted">Duo</span>
    </span>
  );
}

export function Logo({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link href={href} aria-label="PlannerDuo — início">
      <LogoMark className={className} />
    </Link>
  );
}
