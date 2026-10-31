// Foto de um modelo da galeria enviada pelo dono. O endereço leva a versão (?v=), então pode ficar em cache por muito tempo.
import { repo } from "@/data";
import { lookPhoto } from "@/modules/gallery/data";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const b = await repo().shopBySlug(slug);
  if (!b || !/^[\w-]{1,64}$/.test(id)) return new Response("not found", { status: 404 });
  const photo = await lookPhoto(b.shop.id, id).catch(() => null);
  const m = photo?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": "public, max-age=31536000, immutable" },
  });
}
