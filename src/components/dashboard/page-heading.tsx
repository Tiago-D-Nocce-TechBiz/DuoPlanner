/** Cabeçalho padrão de uma página interna do dashboard. */
export function PageHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="font-serif text-2xl font-bold text-zinc-50 md:text-3xl">
        {title}
      </h1>
      {description && (
        <p className="mt-1.5 text-sm text-zinc-400">{description}</p>
      )}
    </div>
  );
}
