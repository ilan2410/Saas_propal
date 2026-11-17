import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Chiffrement symétrique AES-256-GCM des secrets stockés en base (tokens OAuth,
// clés API d'intégrations…). Format : `v1.<iv>.<tag>.<ciphertext>` (base64url).
// La clé (32 octets, hex ou base64) est lue dans la variable d'environnement donnée.

function getKey(envName: string): Buffer {
  const value = process.env[envName];
  if (!value) throw new Error(`${envName} is missing`);
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error(`${envName} must contain 32 bytes`);
  return key;
}

export function encryptSecret(value: string, envName: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(envName), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(value: string, envName: string): string {
  const [version, ivValue, tagValue, encryptedValue] = value.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', getKey(envName), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Empreinte SHA-256 hexadécimale, pour retrouver un token sans le stocker en clair. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
