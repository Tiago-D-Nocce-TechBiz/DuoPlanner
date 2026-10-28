import type { Metadata } from "next";
// Tipografia editorial: Cormorant Garamond (serif) nos títulos,
// Plus Jakarta Sans (sans) na UI/corpo, JetBrains Mono em dados numéricos.
import {
  Plus_Jakarta_Sans,
  Cormorant_Garamond,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans-base",
  subsets: ["latin"],
  display: "swap",
});

const serif = Cormorant_Garamond({
  variable: "--font-serif-title",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-base",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PlannerDuo — Planeje viagens a dois, sem complicações",
  description:
    "PlannerDuo é o app pessoal e 100% gratuito para planejar suas viagens: pesquise voos e hospedagens, organize o roteiro e controle as finanças da dupla.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o tema salvo antes da hidratação para evitar flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
