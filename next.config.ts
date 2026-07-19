import type { NextConfig } from "next";

// Supabase (self-hosted) est utilisé pour l'auth, le storage (images) et le Realtime
// (WebSocket) — les deux protocoles doivent être autorisés en connect-src.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseWsUrl = supabaseUrl.replace(/^http/, 'ws');

// CSP validée en mode report-only sans violation détectée (tous les parcours
// testés : login, dashboard, catalogue + upload image, templates, propositions,
// paramètres + upload logo, crédits) — passée en mode bloquant.
// 'unsafe-eval' n'est ajouté qu'en dev : Turbopack/React l'utilisent pour le
// rafraîchissement à chaud et la reconstruction des call stacks.
const isDev = process.env.NODE_ENV !== 'production';
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? ` 'unsafe-eval'` : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:${supabaseUrl ? ` ${supabaseUrl}` : ''}`,
  `font-src 'self' data:`,
  `connect-src 'self'${supabaseUrl ? ` ${supabaseUrl}` : ''}${supabaseWsUrl ? ` ${supabaseWsUrl}` : ''}`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;