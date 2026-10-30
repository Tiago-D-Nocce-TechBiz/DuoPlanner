import { ExternalLink } from "@/components/ui/icons";
import type { ProviderLink } from "@/lib/deep-links";

/**
 * Links pré-preenchidos da Fase 1 (deep linking). Servem de comparação ao
 * lado dos resultados reais e de alternativa quando a API do motor não está
 * configurada.
 */
export function ProviderLinks({
  title,
  links,
}: {
  title: string;
  links: ProviderLink[];
}) {
  if (links.length === 0) return null;
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-subtle">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={link.note}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground transition-colors hover:border-border-strong hover:text-heading"
          >
            {link.name}
            <ExternalLink className="h-3.5 w-3.5 text-subtle" />
          </a>
        ))}
      </div>
    </div>
  );
}
