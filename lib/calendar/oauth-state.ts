import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CalendarProvider } from './types';

interface OAuthStatePayload {
  userId: string;
  provider: CalendarProvider;
  nonce: string;
  expiresAt: number;
}

function secret(): string {
  const value = process.env.CALENDAR_OAUTH_STATE_SECRET;
  if (!value) throw new Error('CALENDAR_OAUTH_STATE_SECRET is missing');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createCalendarOAuthState(userId: string, provider: CalendarProvider) {
  const nonce = randomBytes(24).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    userId,
    provider,
    nonce,
    expiresAt: Date.now() + 10 * 60 * 1000,
  } satisfies OAuthStatePayload)).toString('base64url');
  return { state: `${payload}.${sign(payload)}`, nonce };
}

export function verifyCalendarOAuthState(state: string, expectedNonce: string, provider: CalendarProvider): OAuthStatePayload {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) throw new Error('invalid_state');
  const expectedSignature = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('invalid_state');
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthStatePayload;
  if (parsed.provider !== provider || parsed.nonce !== expectedNonce || parsed.expiresAt < Date.now()) {
    throw new Error('invalid_state');
  }
  return parsed;
}
