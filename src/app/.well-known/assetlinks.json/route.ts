// Digital Asset Links: prova para a Google Play que o app Android (TWA) e este site são do mesmo dono.
// Preencha ANDROID_PACKAGE e ANDROID_SHA256 na Vercel quando o app for criado na Play Console.
export function GET() {
  const pkg = process.env.ANDROID_PACKAGE;
  const sha = process.env.ANDROID_SHA256;
  const body = pkg && sha
    ? [{
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: sha.split(",").map((s) => s.trim()) },
      }]
    : [];
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600" } });
}
