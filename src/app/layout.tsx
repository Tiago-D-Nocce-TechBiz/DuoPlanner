import type { Metadata, Viewport } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import { RegistrarServiceWorker } from "@/components/pwa/registrar-sw";
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
  title: "DuoPlanner — Planejamento de Viagens e Finanças a Dois",
  description:
    "Planeje passagens aéreas, ônibus, hospedagens, roteiro diário e divida despesas da viagem com privacidade e conformidade LGPD.",
  applicationName: "DuoPlanner",
  // iOS: abre em tela cheia quando instalado ("Adicionar à Tela de Início").
  // statusBarStyle "default" mantém a barra de status fora do conteúdo.
  appleWebApp: {
    capable: true,
    title: "DuoPlanner",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

/**
 * Viewport do app instalável. `viewportFit: "cover"` usa a tela inteira dos
 * iPhones com notch (as margens seguras estão no globals.css).
 *
 * Decisão: NÃO usamos `maximumScale: 1`. Isso bloqueia o zoom de pinça no
 * Android (WCAG 1.4.4, falha no Lighthouse). O motivo comum para pedir —
 * o zoom automático do iOS ao focar um campo — é resolvido na causa: campos
 * com 16 px em telas pequenas (globals.css).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F2ED" },
    { media: "(prefers-color-scheme: dark)", color: "#090D16" },
  ],
};

/**
 * Antes da hidratação:
 * 1) aplica o tema salvo (ou a preferência do sistema), evitando o flash de
 *    tema incorreto (FOUC). Modo Claro é o padrão.
 * 2) guarda o evento `beforeinstallprompt` do Android/Chrome, que pode
 *    disparar antes do React montar o banner de instalação.
 */
const initScript = `
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
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__pdInstalacao = e;
    window.dispatchEvent(new Event('pd:instalacao'));
  });
  window.addEventListener('appinstalled', function () {
    window.__pdInstalacao = null;
    window.dispatchEvent(new Event('pd:instalacao'));
  });
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
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body className={`${manrope.variable} ${playfair.variable} antialiased`}>
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
