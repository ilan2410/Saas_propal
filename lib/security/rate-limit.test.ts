import { beforeEach, describe, expect, it } from 'vitest';
import { getClientIp, rateLimit, resetRateLimits } from './rate-limit';

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('bloque au-delà de la limite puis libère après la fenêtre', () => {
    const t0 = 1_000_000;
    expect(rateLimit('k', 2, 1000, t0).allowed).toBe(true);
    expect(rateLimit('k', 2, 1000, t0 + 10).allowed).toBe(true);
    const blocked = rateLimit('k', 2, 1000, t0 + 20);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(1);
    expect(rateLimit('k', 2, 1000, t0 + 1001).allowed).toBe(true);
  });

  it('isole les clés entre elles', () => {
    expect(rateLimit('a', 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit('b', 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit('a', 1, 1000, 1).allowed).toBe(false);
  });
});

describe('getClientIp', () => {
  it('prend la première IP de X-Forwarded-For', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('retombe sur unknown sans en-tête', () => {
    expect(getClientIp(new Request('http://x'))).toBe('unknown');
  });
});
