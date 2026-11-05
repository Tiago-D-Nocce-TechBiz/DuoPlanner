import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Oculta o indicador de desenvolvimento do Next.js (ícone "N" no canto),
  // que sobrepunha o rodapé da Sidebar.
  devIndicators: false,
  // Server Actions ficam no limite padrão (1 MB). O limite de 10 MB era para
  // a leitura de recibos, que não está mais na interface; com ele, qualquer
  // action aceitava corpos de até 10 MB.
  images: {
    // Fotos das hospedagens vêm do CDN da Booking.com.
    remotePatterns: [{ protocol: "https", hostname: "**.bstatic.com" }],
  },
  // Rotas consolidadas: /registo era cópia de /cadastro. `permanent: true`
  // responde 308 (preserva método e query, ex.: ?convite=CODIGO).
  async redirects() {
    return [{ source: "/registo", destination: "/cadastro", permanent: true }];
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
      // Service Worker: nunca em cache (atualização imediata) e com CSP
      // própria, restrita à mesma origem.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
