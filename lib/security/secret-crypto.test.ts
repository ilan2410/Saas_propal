import { afterEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, sha256Hex } from './secret-crypto';

const ENV = 'TEST_SECRET_CRYPTO_KEY';

afterEach(() => {
  delete process.env[ENV];
});

describe('secret-crypto', () => {
  it('chiffre puis déchiffre une valeur', () => {
    process.env[ENV] = Buffer.alloc(32, 3).toString('hex');
    const encrypted = encryptSecret('cle-api-docuseal', ENV);
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(encrypted).not.toContain('cle-api-docuseal');
    expect(decryptSecret(encrypted, ENV)).toBe('cle-api-docuseal');
  });

  it('échoue sans clé configurée, en nommant la variable', () => {
    expect(() => encryptSecret('x', ENV)).toThrow(ENV);
  });

  it('refuse un secret chiffré avec une autre clé', () => {
    process.env[ENV] = Buffer.alloc(32, 1).toString('base64');
    const encrypted = encryptSecret('x', ENV);
    process.env[ENV] = Buffer.alloc(32, 2).toString('base64');
    expect(() => decryptSecret(encrypted, ENV)).toThrow();
  });

  it('sha256Hex est stable', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
