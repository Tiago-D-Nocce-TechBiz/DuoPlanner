import { cn } from "@/lib/utils";

/**
 * Superfície padrão da Fase 2: fundo zinc-900, borda sutil de 1px (zinc-800)
 * e cantos rounded-2xl. `cardClass` existe para aplicar o mesmo visual em
 * elementos que não são <div> (links, formulários, seções).
 */
export const cardClass = "rounded-2xl border border-border bg-card";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(cardClass, className)} {...props} />;
}
