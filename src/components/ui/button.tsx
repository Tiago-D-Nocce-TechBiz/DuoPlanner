import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Botão do sistema de design PlannerDuo.
 *
 * Variantes:
 * - "primary": Amarelo Pastel (#FCEB88) com texto PRETO. Uso ESTRITO em ações
 *   principais, conforme a identidade visual.
 * - "secondary": superfície zinc-900 com borda zinc-800.
 * - "ghost": transparente, apenas texto, para ações terciárias.
 *
 * Pode renderizar-se como <button> ou, quando `href` é fornecido, como <Link>.
 */

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-[#f7e36a] active:bg-[#efd94f]",
  secondary:
    "bg-zinc-900 text-zinc-200 border border-zinc-800 hover:bg-zinc-800",
  ghost: "bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100",
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

  const { variant: _v, size: _s, className: _c, children: _ch, ...rest } =
    props as ButtonAsButton;
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
