import type { NextConfig } from "next";

// Cabeçalhos de segurança enviados em todas as páginas.
// O CSP diz ao navegador de onde o app pode carregar coisas: só do próprio site e do Supabase.
// Assim, mesmo que alguém consiga injetar um texto malicioso, o navegador não roda script de fora nem manda dados para outro site.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
const dev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // o Next.js precisa de scripts inline para hidratar a página; eval só no modo de desenvolvimento
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabase.replace(/^https:/, "wss:")}${dev ? " ws:" : ""}`.replace(/\s+/g, " ").trim(),
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // só HTTPS por 2 anos (o navegador recusa versão sem cadeado)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // ninguém coloca o Navalha dentro de outro site para enganar o usuário (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // links para outros sites não levam o endereço completo da página (que pode ter dados)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // câmera só no próprio site (foto do corte ideal); microfone, localização e pagamento por navegador desligados
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // o service worker precisa sempre da versão mais nova
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
