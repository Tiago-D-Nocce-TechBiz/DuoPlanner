import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Oculta o indicador de desenvolvimento do Next.js (ícone "N" no canto),
  // que sobrepunha o rodapé da Sidebar.
  devIndicators: false,
  experimental: {
    serverActions: {
      // processReceiptImage recebe o recibo em base64 (até 6 MB de arquivo,
      // ~8 MB codificado). O padrão de 1 MB cortaria PDFs e fotos sem
      // redução no navegador.
      bodySizeLimit: "10mb",
    },
  },
  images: {
    // Fotos das hospedagens vêm do CDN da Booking.com.
    remotePatterns: [{ protocol: "https", hostname: "**.bstatic.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Cabeçalhos de segurança HTTP aplicados a todas as rotas. Mantemos um
  // conjunto conservador (sem CSP estrita) para não quebrar scripts inline do
  // Next, fontes do Google, Supabase e o WebGL do avião 3D. A microfone é
  // liberada para o ditado por voz da Nora (Web Speech API).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
