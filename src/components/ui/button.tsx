import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Botão do sistema de design DuoPlanner (Premium Dark).
 *
 * Variantes:
 * - "primary": amarelo pastel (#F2EAB7) com texto preto. Use só na ação
 *   principal de cada contexto.
 * - "secondary": superfície zinc-900 com borda zinc-800.
 * - "ghost": transparente, apenas texto.
 *
 * Renderiza <button> ou, quando `href` é fornecido, <Link>.
 */

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary:
    "border border-border bg-card text-heading hover:border-border-strong hover:bg-elevated",
  ghost: "bg-transparent text-muted hover:bg-card hover:text-heading",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
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
