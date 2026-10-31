import type { MetadataRoute } from "next";

// App instalável do Navalha (painel da barbearia). Cada barbearia também tem o próprio,
// com o nome dela, em /b/[slug]/manifest.webmanifest (é o que o cliente instala).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/painel",
    name: "Navalha · Gestão de barbearias",
    short_name: "Navalha",
    description: "Agenda, clientes, planos, financeiro e comissões da sua barbearia.",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "pt-BR",
    categories: ["business", "productivity", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
