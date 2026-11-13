import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { CACHE_IMUTAVEL, rotasImutaveis } from "./src/lib/cache/ativos-imutaveis";
import { analisarAmbiente, descreverAmbiente, ErroDeAmbiente } from "./src/lib/env/esquema";

/**
 * Fail-fast do ambiente no build, no `next dev` e no `next start`: valor
 * malformado (chave secreta numa NEXT_PUBLIC_, URL inválida, CRON_SECRET
 * curto...) interrompe aqui, antes de compilar, e o deploy quebrado nunca vai
 * ao ar. O `instrumentation.ts` repete a validação em cada instância do
 * servidor (que na Vercel não lê este arquivo) e imprime o relatório.
 */
function validarAmbiente(fase: string): void {
  const resultado = analisarAmbiente(process.env);
  if (!resultado.ok) throw new ErroDeAmbiente(resultado.erros);
  // O build avalia este arquivo de novo nos workers (que herdam o ambiente):
  // a marca faz o relatório sair uma vez só.
  if (fase === PHASE_PRODUCTION_BUILD && !process.env.PD_AMBIENTE_RELATADO) {
    process.env.PD_AMBIENTE_RELATADO = "1";
    console.info(descreverAmbiente(resultado));
  }
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // gzip no `next start` (na Vercel, a borda comprime com brotli por conta
  // própria). Explícito para ninguém desligar sem querer.
  compress: true,
  // Sem "X-Powered-By: Next.js": bytes a menos e nada de anunciar a stack.
  poweredByHeader: false,
  // Oculta o indicador de desenvolvimento do Next.js (ícone "N" no canto),
  // que sobrepunha o rodapé da Sidebar.
  devIndicators: false,
  // Server Actions ficam no limite padrão (1 MB). O limite de 10 MB era para
  // a leitura de recibos, que não está mais na interface; com ele, qualquer
  // action aceitava corpos de até 10 MB.
  images: {
    // AVIF para quem aceita, WebP como reserva (o formato original fica para
    // navegadores sem nenhum dos dois).
    formats: ["image/avif", "image/webp"],
    // Fotos das hospedagens vêm do CDN da Booking.com, numa URL assinada por
    // foto (o conteúdo de uma URL não muda): 31 dias em cache em vez de 4 h
    // poupa reotimizações (e a cota de imagens da Vercel).
    remotePatterns: [{ protocol: "https", hostname: "**.bstatic.com" }],
    minimumCacheTTL: 2_678_400,
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
  // Next, Supabase e o WebGL do avião 3D. A microfone é liberada para o
  // ditado por voz da Nora (Web Speech API).
  async headers() {
    return [
      // Ícones, marca e modelo 3D: um ano, imutável. Os nomes não têm hash;
      // o teste `ativos-imutaveis.test.ts` barra conteúdo novo na mesma URL.
      ...rotasImutaveis().map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: CACHE_IMUTAVEL }],
      })),
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

export default function configuracao(fase: string): NextConfig {
  validarAmbiente(fase);
  return nextConfig;
}
