import type { Metadata } from "next";
import { Manrope, Playfair_Display, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

// Fonte display da marca "DuoPlanner": serifada refinada, com ar editorial e
// sofisticado — reservada ao wordmark (classe utilitária `.brand-wordmark`).
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DuoPlanner — Planejamento de Viagens e Finanças a Dois",
  description:
    "Planeje passagens aéreas, ônibus, hospedagens, roteiro diário e divida despesas da viagem com privacidade e conformidade LGPD.",
};

/**
 * Aplica o tema salvo (ou a preferência do sistema) antes da hidratação,
 * evitando o flash de tema incorreto (FOUC). Modo Claro é o padrão.
 */
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('duoplanner-theme');
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (t !== 'light') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      }
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${manrope.variable} ${playfair.variable} ${cormorant.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}