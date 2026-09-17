import { afterEach, describe, expect, it } from 'vitest';
import { decryptCalendarSecret, encryptCalendarSecret } from './crypto';

const originalKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = originalKey;
});

describe('calendar secret encryption', () => {
  it('round-trips a token without storing it in plaintext', () => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptCalendarSecret('refresh-token-secret');
    expect(encrypted).not.toContain('refresh-token-secret');
    expect(decryptCalendarSecret(encrypted)).toBe('refresh-token-secret');
  });

  it('rejects tampered ciphertext', () => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const encrypted = encryptCalendarSecret('token');
    const parts = encrypted.split('.');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString('base64url');
    expect(() => decryptCalendarSecret(parts.join('.'))).toThrow();
  });
});
