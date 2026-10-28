import { cn } from "@/lib/utils";

/** Rótulo + input de texto estilizado para o tema escuro. */
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
      <label htmlFor={id} className="block text-sm font-medium text-zinc-300">
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
        className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent focus:outline-none"
      />
    </div>
  );
}
