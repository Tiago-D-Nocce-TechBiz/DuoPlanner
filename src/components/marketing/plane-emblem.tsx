/**
 * Emblema de avião — ícone de design avançado (SVG estático, sem interação).
 *
 * Substitui a antiga rota aérea arrastável por um selo elegante: avião com
 * profundidade (gradientes + sombra), um anel orbital sutil e um rastro de
 * voo. Puramente decorativo e leve; serve de marca visual no Hero.
 */
export function PlaneEmblem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 160"
      className={className}
      role="img"
      aria-label="Emblema de viagem DuoPlanner"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="emblemBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-warm)" />
          <stop offset="100%" stopColor="var(--color-brand-teal)" />
        </linearGradient>
        <radialGradient id="emblemGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="var(--color-brand-warm)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-brand-warm)" stopOpacity="0" />
        </radialGradient>
        <filter id="emblemShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodOpacity="0.2" />
        </filter>
      </defs>

      {/* Brilho ambiental */}
      <circle cx="80" cy="74" r="66" fill="url(#emblemGlow)" />

      {/* Anel orbital pontilhado (cartografia discreta) */}
      <circle
        cx="80"
        cy="80"
        r="54"
        stroke="var(--color-border-strong)"
        strokeWidth="1.5"
        strokeDasharray="2 8"
        opacity="0.55"
      />

      {/* Rastro de voo curvo */}
      <path
        d="M 30 112 C 58 96, 70 70, 118 48"
        stroke="var(--color-brand-teal)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 9"
        opacity="0.6"
      />

      {/* Avião com volume */}
      <g filter="url(#emblemShadow)" transform="translate(80 80) rotate(-38)">
        <path
          d="M 34 0 L 6 -7 L -10 -30 L -18 -30 L -9 -7 L -24 -7 L -31 -17 L -38 -17 L -34 0 L -38 17 L -31 17 L -24 7 L -9 7 L -18 30 L -10 30 L 6 7 Z"
          fill="url(#emblemBody)"
          stroke="var(--color-heading)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* Reflexo para dar sensação 3D */}
        <path
          d="M 34 0 L 6 -7 L -10 -30 L -18 -30 L -9 -7 L -24 -7 Z"
          fill="#ffffff"
          opacity="0.18"
        />
      </g>
    </svg>
  );
}
