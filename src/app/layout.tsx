import type { Metadata, Viewport } from "next";
// Tipografia híbrida (Fase 2): Playfair Display (serif) nos títulos e Manrope
// (sans geométrica) no corpo e na interface. Ambas são fontes variáveis, então
// não é preciso listar pesos.
import { Manrope, Playfair_Display } from "next/font/google";
import "./globals.css";

const sans = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const serif = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PlannerDuo — Planeje viagens a dois, sem complicações",
  description:
    "PlannerDuo é o app pessoal e 100% gratuito para planejar viagens a dois: busque voos e hospedagens, registre despesas com IA e organize o roteiro da dupla.",
};

// App 100% escuro: barra do navegador/PWA e controles nativos no tom do fundo.
export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
