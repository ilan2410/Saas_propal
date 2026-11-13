/**
 * Limiteur de débit en mémoire (fenêtre glissante).
 *
 * Adapté à un déploiement mono-instance (conteneur Docker unique). Les compteurs
 * sont perdus au redémarrage et ne sont pas partagés entre instances : en cas de
 * passage à plusieurs instances, remplacer le stockage par Redis/Supabase.
 */

type Bucket = { hits: number[]; windowMs: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;
const SWEEP_EVERY_MS = 60_000;
const MAX_KEYS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  /** Secondes avant qu'une nouvelle tentative soit possible (0 si autorisé). */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  sweep(now);

  const hits = (buckets.get(key)?.hits ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    buckets.set(key, { hits, windowMs });
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
  }

  hits.push(now);
  buckets.set(key, { hits, windowMs });
  return { allowed: true, retryAfter: 0 };
}

function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS && buckets.size < MAX_KEYS) return;
  lastSweep = now;
  for (const [key, { hits, windowMs }] of buckets) {
    if (hits.length === 0 || now - hits[hits.length - 1] >= windowMs) {
      buckets.delete(key);
    }
  }
}

/** Test uniquement. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
}

/** IP du client (derrière un reverse proxy qui renseigne X-Forwarded-For). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
