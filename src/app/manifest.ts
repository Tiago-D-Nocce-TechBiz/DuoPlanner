import type { MetadataRoute } from "next";

/**
 * Web App Manifest (servido em /manifest.webmanifest) — torna o DuoPlanner
 * instalável no Android e no iOS. Os ícones saem do logo oficial
 * (`public/brand/logo.png`); os "maskable" têm margem para o recorte
 * redondo/arredondado dos launchers. A cor de fundo é a do próprio ícone, para
 * a tela de abertura (splash) não "piscar" outra cor.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "DuoPlanner",
    short_name: "DuoPlanner",
    description:
      "Viagens e finanças a dois: roteiro, checklist, gastos e acerto de contas sincronizados entre o casal, até offline.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#030F1E",
    theme_color: "#090D16",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["travel", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "DuoFinance",
        short_name: "DuoFinance",
        url: "/dashboard/financas",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Checklist de viagem",
        short_name: "Checklist",
        url: "/dashboard/checklist",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Conversor de moedas",
        short_name: "Conversor",
        url: "/dashboard/conversor",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
