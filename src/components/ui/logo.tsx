import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Marca do PlannerDuo (editorial). "Planner" em serif espresso,
 * "Duo" em tom couro/sand para contraste sóbrio — sem amarelo.
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
        "font-serif text-2xl font-bold tracking-tight text-[#1C1917]",
        className
      )}
    >
      Planner<span className="text-[#8C7A6B]">Duo</span>
    </Link>
  );
}
