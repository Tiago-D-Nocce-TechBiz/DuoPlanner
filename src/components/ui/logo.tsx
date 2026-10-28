import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Marca do PlannerDuo. "Planner" em serif claro, "Duo" com destaque Amarelo Pastel.
 */
export function Logo({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-serif text-xl font-bold tracking-tight text-zinc-100",
        className
      )}
    >
      Planner<span className="text-accent">Duo</span>
    </Link>
  );
}
