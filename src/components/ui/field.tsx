import { cn } from "@/lib/utils";

/**
 * Rótulo + input de texto no estilo editorial claro translúcido.
 * bg-white/85, borda sand, foco em couro (#8C7A6B) com ring suave.
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
      <label htmlFor={id} className="block text-sm font-medium text-[#44403C]">
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
        className="h-11 w-full rounded-xl border border-[#DCD5C7] bg-white/85 px-3.5 text-sm text-[#1C1917] placeholder:text-[#A8A29E] transition-colors focus:border-[#8C7A6B] focus:outline-none focus:ring-4 focus:ring-[#8C7A6B]/10"
      />
    </div>
  );
}
