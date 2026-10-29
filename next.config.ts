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
};

export default nextConfig;
