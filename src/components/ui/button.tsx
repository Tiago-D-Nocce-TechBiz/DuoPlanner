import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Botão do sistema de design PlannerDuo (redesign editorial).
 *
 * Variantes:
 * - "primary": Espresso profundo (#1C1917) com texto Alabaster. Ações principais
 *   e item ativo da Sidebar.
 * - "secondary": Bege areia (#EFECE6) com texto espresso e borda sand.
 * - "ghost": transparente, apenas texto, para ações terciárias.
 *
 * Pode renderizar-se como <button> ou, quando `href` é fornecido, como <Link>.
 */

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none disabled:opacity-60 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#1C1917] text-[#FAF8F5] hover:bg-[#292524] shadow-[0_6px_20px_-6px_rgba(28,25,23,0.35)]",
  secondary:
    "bg-[#EFECE6] text-[#292524] border border-[#DFD9CE] hover:bg-[#E6E1D6]",
  ghost: "bg-transparent text-[#57534E] hover:bg-[#EFECE6] hover:text-[#1C1917]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

type ButtonAsButton = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonAsLink = CommonProps & {
  href: string;
  target?: string;
  rel?: string;
};

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = "primary", size = "md", className, children } = props;
  const classes = cn(base, variants[variant], sizes[size], className);

  if ("href" in props && props.href) {
    const { href, target, rel } = props;
    return (
      <Link href={href} target={target} rel={rel} className={classes}>
        {children}
      </Link>
    );
  }

  // Remove props específicas do design system antes de espalhar no <button>.
  const {
    variant: _variant,
    size: _size,
    className: _className,
    children: _children,
    ...rest
  } = props as ButtonAsButton;
  void _variant;
  void _size;
  void _className;
  void _children;

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
