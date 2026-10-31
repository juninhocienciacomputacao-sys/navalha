import { repo } from "@/data";

// App instalável de cada barbearia: o cliente instala com o nome da barbearia e abre direto no agendamento.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await repo().shopBySlug(slug);
  if (!b) return new Response("not found", { status: 404 });
  const base = `/b/${b.shop.slug}`;
  const body = {
    id: base,
    name: b.shop.name,
    short_name: shortName(b.shop.name),
    description: "Agende seu horário",
    start_url: base,
    scope: base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#0a0a0a",
    lang: { pt: "pt-BR", en: "en", es: "es" }[b.shop.defaultLang] ?? "pt-BR",
    categories: ["lifestyle", "beauty"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

/** Nome curto embaixo do ícone (até 12 letras, sem cortar palavra no meio). */
function shortName(name: string) {
  if (name.length <= 12) return name;
  let out = "";
  for (const w of name.split(/\s+/)) {
    if ((out ? out.length + 1 : 0) + w.length > 12) break;
    out = out ? `${out} ${w}` : w;
  }
  return out || name.slice(0, 12);
}
