import { cn } from "@/lib/utils";

/**
 * Classes partilhadas dos campos de formulário (Premium Dark): campo afundado
 * em zinc-950 dentro dos cards zinc-900, borda zinc-800 e foco em zinc-700.
 */
export const inputClass =
  "h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-heading placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/40 disabled:opacity-50";

export const labelClass = "mb-1.5 block text-sm font-medium text-muted";

/** Rótulo + input de texto. */
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
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
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
        className={cn(inputClass)}
      />
    </div>
  );
}
