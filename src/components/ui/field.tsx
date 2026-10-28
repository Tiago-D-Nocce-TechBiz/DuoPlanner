import { cn } from "@/lib/utils";

/**
 * Rótulo + input de texto no estilo editorial, adaptativo ao tema.
 * Claro: vidro branco translúcido. Escuro: superfície de vidro escura.
 */
export function Field({
  label,
  id,
  type = "text",
  placeholder,
  required,
  autoComplete,
  defaultValue,
  className,
}: {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-heading/80">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className="h-11 w-full rounded-xl border border-field-border bg-white/85 px-3.5 text-sm text-heading placeholder:text-[color:var(--placeholder)] transition-colors focus:border-field-focus focus:outline-none focus:ring-4 focus:ring-field-focus/10 dark:bg-white/[0.04]"
      />
    </div>
  );
}
