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
      <h1 className="font-serif text-3xl font-bold text-[#1C1917] md:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="mt-1.5 text-sm text-[#57534E]">{description}</p>
      )}
    </div>
  );
}
