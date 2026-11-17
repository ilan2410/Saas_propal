import { decryptSecret, encryptSecret } from '@/lib/security/secret-crypto';

const ENV_NAME = 'CALENDAR_TOKEN_ENCRYPTION_KEY';

export function encryptCalendarSecret(value: string): string {
  return encryptSecret(value, ENV_NAME);
}

export function decryptCalendarSecret(value: string): string {
  return decryptSecret(value, ENV_NAME);
}
