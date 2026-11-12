import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Ícones próprios do DuoPlanner.
 *
 * Conjunto desenhado para o sistema (não usa biblioteca de terceiros). Todos
 * os traços usam `currentColor`, então o ícone herda a cor do texto ao redor
 * — fica quase preto no tema Claro (`--color-heading` / `--color-foreground`)
 * e quase branco no tema Escuro, sem nenhuma cor fixa. Estilo de linha
 * uniforme (stroke 1.75, cantos e pontas arredondados) para uma identidade
 * visual coesa e monocromática.
 *
 * API compatível com o uso anterior: cada ícone aceita `className`
 * (ex.: `h-5 w-5`) e demais props de SVG. O tamanho padrão é 24.
 */

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

/** Base comum: define viewBox, stroke currentColor e props de acessibilidade. */
function Icon({ className, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Navegação e estrutura                                               */
/* ------------------------------------------------------------------ */

export function LayoutDashboard(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="3" width="7" height="8" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function LayoutGrid(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </Icon>
  );
}

export function Menu(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

export function X(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function Settings(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Viagem                                                              */
/* ------------------------------------------------------------------ */

export function Plane(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M21 15.5 13.5 13V6.2a1.7 1.7 0 0 0-3.4 0V13L2.5 15.5v2l7.6-2.1v3.4l-2.1 1.6v1.6l3.8-1 3.8 1v-1.6l-2.1-1.6v-3.4l7.6 2.1z" />
    </Icon>
  );
}

export function PlaneTakeoff(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2 20h20" />
      <path d="M3.5 13.5 5 15l5-1 7.5-2.3a2 2 0 1 0-1-3.7l-3 1-4.5-3-2 .6 2.6 3.2-3.3 1-2-1.2-1.3.5z" />
    </Icon>
  );
}

export function Hotel(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 21V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v16" />
      <path d="M2 21h20" />
      <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01" />
      <path d="M9 21v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </Icon>
  );
}

export function BedDouble(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 18V7M21 18v-5a3 3 0 0 0-3-3H3" />
      <path d="M3 13h18M3 18h18" />
      <path d="M7 10V8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    </Icon>
  );
}

export function Bus(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M4 10h16" />
      <circle cx="8" cy="18" r="1.6" />
      <circle cx="16" cy="18" r="1.6" />
      <path d="M6 16v2M18 16v2" />
    </Icon>
  );
}

export function Map(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </Icon>
  );
}

export function Compass(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </Icon>
  );
}

export function Luggage(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="5" y="7" width="14" height="13" rx="2" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M10 11v5M14 11v5" />
      <path d="M8 20v1M16 20v1" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Documentos e listas                                                 */
/* ------------------------------------------------------------------ */

export function FileText(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </Icon>
  );
}

export function ScrollText(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4z" />
      <path d="M6 4a2 2 0 0 0-2 2v1h3" />
      <path d="M9 9h7M9 13h7M9 17h4" />
    </Icon>
  );
}

export function Receipt(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 3v18l2-1.3 2 1.3 2-1.3 2 1.3 2-1.3 2 1.3V3l-2 1.3L14 3l-2 1.3L10 3 8 4.3z" />
      <path d="M9 8h6M9 12h6" />
    </Icon>
  );
}

export function ReceiptText(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 3v18l2-1.3 2 1.3 2-1.3 2 1.3 2-1.3 2 1.3V3l-2 1.3L14 3l-2 1.3L10 3 8 4.3z" />
      <path d="M9 8h6M9 12h4" />
    </Icon>
  );
}

export function ScanLine(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M4 12h16" />
    </Icon>
  );
}

export function PenLine(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 20h16" />
      <path d="m15 5 3 3-8.5 8.5H6.5v-3z" />
    </Icon>
  );
}

export function Database(p: IconProps) {
  return (
    <Icon {...p}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v13c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-13" />
      <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
    </Icon>
  );
}

export function History(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </Icon>
  );
}

export function Clock(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Finanças                                                            */
/* ------------------------------------------------------------------ */

export function Wallet(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h12v3" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5" />
      <circle cx="16.5" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function Coins(p: IconProps) {
  return (
    <Icon {...p}>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
      <path d="M3 11v4c0 1.7 2.7 3 6 3 1 0 2-.1 2.9-.4" />
      <circle cx="16" cy="15" r="5" />
    </Icon>
  );
}

export function TrendingUp(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 17 10 10l4 4 7-7" />
      <path d="M15 7h6v6" />
    </Icon>
  );
}

export function Handshake(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m11 17 2 2a1 1 0 0 0 1.4 0l5.6-5.6V8l-4-4H8L3 8" />
      <path d="M3 8v6l3 3" />
      <path d="M8 4 5 7a1.4 1.4 0 0 0 0 2l1.5 1.5a1.4 1.4 0 0 0 2 0L12 7" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Alertas, estados e feedback                                         */
/* ------------------------------------------------------------------ */

export function Bell(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function AlertTriangle(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ShieldCheck(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function Loader2(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Icon>
  );
}

export function Star(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.9 6.6 20l1-6.1L3.2 9.5l6.1-.9z" />
    </Icon>
  );
}

export function Sparkles(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5z" />
      <path d="M18.5 14.5c.2 1.6.6 2 2.2 2.2-1.6.2-2 .6-2.2 2.2-.2-1.6-.6-2-2.2-2.2 1.6-.2 2-.6 2.2-2.2z" />
    </Icon>
  );
}

export function Lightbulb(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1 .9 1.6V16h5.2v-.5c0-.6.3-1.1.9-1.6A6 6 0 0 0 12 3z" />
    </Icon>
  );
}

export function Brain(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 5a2.5 2.5 0 0 0-5 .5 2.5 2.5 0 0 0-2 4 2.5 2.5 0 0 0 1 4.5 2.5 2.5 0 0 0 5 1z" />
      <path d="M12 5a2.5 2.5 0 0 1 5 .5 2.5 2.5 0 0 1 2 4 2.5 2.5 0 0 1-1 4.5 2.5 2.5 0 0 1-5 1z" />
      <path d="M12 5v15" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Ações, setas e busca                                                */
/* ------------------------------------------------------------------ */

export function Search(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function SlidersHorizontal(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="9" cy="16" r="2" />
    </Icon>
  );
}

export function Shuffle(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M17 4h4v4M21 4l-6 6M3 4l6 6M17 20h4v-4M21 20 9 8M3 20l6-6" />
    </Icon>
  );
}

export function ArrowRight(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </Icon>
  );
}

export function ArrowUpRight(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7 17 17 7M8 7h9v9" />
    </Icon>
  );
}

export function ExternalLink(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </Icon>
  );
}

export function LogOut(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  );
}

export function Users(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8" />
      <path d="M17.5 14.6c2 .7 3.5 2.5 3.5 5.4" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Tema (sol / lua)                                                    */
/* ------------------------------------------------------------------ */

export function Sun(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </Icon>
  );
}

export function Moon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />
    </Icon>
  );
}

export function CheckCircle2(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </Icon>
  );
}

export function Plus(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** Microfone (ditado por voz — Web Speech API). */
export function Mic(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4M8 22h8" />
    </Icon>
  );
}

/** Seta para cima (enviar mensagem). */
export function ArrowUp(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Icon>
  );
}

/** Expandir / recolher a largura do painel (setas diagonais). */
export function Expand(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 14v6h6M20 10V4h-6" />
      <path d="M14 10l6-6M10 14l-6 6" />
    </Icon>
  );
}

/** Varinha mágica (menu de prompts prontos). */
export function Wand(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 4V2M15 10V8M12 7h-2M20 7h-2" />
      <path d="M3 21l12-12-2-2L1 19z" />
      <path d="M12.5 7.5l2 2" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* DuoFinance — categorias e controles da importação de fatura         */
/* ------------------------------------------------------------------ */

/** Talheres (Alimentação). */
export function Utensils(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
      <path d="M6 12v9" />
      <path d="M17 3c-1.7 0-3 1.8-3 4s1.3 4 3 4" />
      <path d="M17 3v18" />
    </Icon>
  );
}

/** Carro (Transporte). */
export function Car(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
      <path d="M3 16v-2.5A2.5 2.5 0 0 1 5.5 11h13A2.5 2.5 0 0 1 21 13.5V16a1 1 0 0 1-1 1h-1" />
      <path d="M5 17H4a1 1 0 0 1-1-1" />
      <circle cx="7.5" cy="16.5" r="1.5" />
      <circle cx="16.5" cy="16.5" r="1.5" />
    </Icon>
  );
}

/** Sacola de compras (Compras). */
export function ShoppingBag(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 7h12l-1 13H7L6 7z" />
      <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
    </Icon>
  );
}

/** Ingresso (Lazer & Passeios). */
export function Ticket(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />
      <path d="M13 6v2M13 11v2M13 16v2" />
    </Icon>
  );
}

/** Setas em ciclo (Assinaturas / recorrência). */
export function Repeat(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M17 3l3 3-3 3" />
      <path d="M20 6H8a4 4 0 0 0-4 4v1" />
      <path d="M7 21l-3-3 3-3" />
      <path d="M4 18h12a4 4 0 0 0 4-4v-1" />
    </Icon>
  );
}

/** Cápsula (Saúde & Farmácia). */
export function Pill(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(45 12 12)" />
      <path d="M8.5 8.5l7 7" />
    </Icon>
  );
}

/** Prédio institucional (Taxas & Impostos). */
export function Landmark(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3l8 5H4l8-5z" />
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
      <path d="M4 20h16" />
    </Icon>
  );
}

/** Camadas (visão de parcelas). */
export function Layers(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Icon>
  );
}

/** Funil (filtro). */
export function Filter(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" />
    </Icon>
  );
}

/** Seta para baixo (dropdown). */
export function ChevronDown(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

/** Upload (arrastar e soltar arquivo). */
export function Upload(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

/** Cadeado (gasto privado). */
export function Lock(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* Sincronização                                                       */
/* ------------------------------------------------------------------ */

/** Contorno de nuvem compartilhado pelos estados de sincronização. */
const NUVEM = "M7 19h10a4 4 0 0 0 .8-7.92A6 6 0 0 0 6.2 10.1 4.5 4.5 0 0 0 7 19z";

/** Nuvem com visto: tudo salvo na nuvem. */
export function CloudCheck(p: IconProps) {
  return (
    <Icon {...p}>
      <path d={NUVEM} />
      <path d="M9.2 14.6l2 2 3.8-3.9" />
    </Icon>
  );
}
/** Nuvem com seta: enviando alterações. */
export function CloudUp(p: IconProps) {
  return (
    <Icon {...p}>
      <path d={NUVEM} />
      <path d="M12 17v-4.8" />
      <path d="M9.7 14.4l2.3-2.3 2.3 2.3" />
    </Icon>
  );
}
/** Nuvem riscada: sem conexão. */
export function CloudOff(p: IconProps) {
  return (
    <Icon {...p}>
      <path d={NUVEM} />
      <path d="M4 4l16 16" />
    </Icon>
  );
}
/** Aparelho: salvo só neste dispositivo. */
export function Smartphone(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="7" y="3" width="10" height="18" rx="2.2" />
      <path d="M11 17.5h2" />
    </Icon>
  );
}
/** Desfazer (seta que volta). */
export function Undo(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 13.5L4.5 9 9 4.5" />
      <path d="M4.5 9H14a5.5 5.5 0 0 1 0 11h-3" />
    </Icon>
  );
}

/** Tipo compatível com o antigo `LucideIcon` (um componente de ícone). */
export type AppIcon = (props: IconProps) => React.ReactElement;
