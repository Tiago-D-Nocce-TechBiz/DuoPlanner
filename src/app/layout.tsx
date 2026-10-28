import type { Metadata } from "next";
// Tipografia híbrida: Playfair Display (serif) para títulos, Inter (sans) para corpo,
// e JetBrains Mono para dados tabulares/numéricos (datas, códigos de voo).
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans-base",
  subsets: ["latin"],
  display: "swap",
});

const serif = Playfair_Display({
  variable: "--font-serif-title",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-base",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PlannerDuo — Planeie viagens a dois, sem complicações",
  description:
    "PlannerDuo é a aplicação pessoal e 100% gratuita para planear as suas viagens: pesquise voos e estadias, organize o roteiro e controle as finanças da dupla.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-PT"
      className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-300">
        {children}
      </body>
    </html>
  );
}
