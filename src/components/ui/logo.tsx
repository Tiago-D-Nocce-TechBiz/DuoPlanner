import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Marca do DuoPlanner: "Duo" em itálico (tom suave) + "Planner" em Playfair.
 * Monocromática — segue os tokens de tema (heading/muted).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("brand-wordmark text-2xl sm:text-3xl", className)}>
      <span className="brand-duo">Duo</span>
      <span className="brand-planner">Planner</span>
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
    <Link href={href} aria-label="DuoPlanner — início">
      <LogoMark className={className} />
    </Link>
  );
}
