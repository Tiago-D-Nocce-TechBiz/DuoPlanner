import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
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

export const metadata: Metadata = {
  title: "PlannerDuo — Planejamento de Viagens e Finanças a Dois",
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
    var t = localStorage.getItem('plannerduo-theme');
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
      <body className={`${manrope.variable} ${playfair.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}