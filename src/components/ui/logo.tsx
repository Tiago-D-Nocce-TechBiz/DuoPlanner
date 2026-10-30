import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Marca do DuoPlanner: "Duo" em itálico (tom suave) + "Planner" em Playfair.
 * Monocromática — segue os tokens de tema (heading/muted).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-serif text-2xl font-semibold tracking-tight text-heading",
        className
      )}
    >
      <span className="font-normal italic text-muted">Duo</span>Planner
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
