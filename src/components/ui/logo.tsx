import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Marca do PlannerDuo (editorial, adaptativa ao tema).
 * "Planner" em serif (heading) + "Duo" em tom couro/sand (leather).
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
        "font-serif text-2xl font-bold tracking-tight text-heading",
        className
      )}
    >
      Planner<span className="text-leather">Duo</span>
    </Link>
  );
}
