/** Cabeçalho padrão de uma página interna do dashboard. */
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  /** Ações opcionais alinhadas à direita (ex.: botão principal da página). */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-serif text-3xl font-semibold text-heading md:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex shrink-0 gap-3">{children}</div>}
    </div>
  );
}
