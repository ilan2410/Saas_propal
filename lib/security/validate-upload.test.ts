import { describe, expect, it } from 'vitest';
import { safeStorageFileName } from './validate-upload';

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/;

function slugOf(name: string, ext: string): string {
  const generated = safeStorageFileName(name, ext);
  expect(generated).toMatch(UUID_PREFIX);
  expect(generated.endsWith(`.${ext}`)).toBe(true);
  return generated.replace(UUID_PREFIX, '').slice(0, -(ext.length + 1));
}

describe('safeStorageFileName', () => {
  it('conserve le nom d\'origine, sans accents ni espaces', () => {
    expect(slugOf('Facture Orange Août.pdf', 'pdf')).toBe('facture-orange-aout');
  });

  it('retire l\'extension d\'origine avant d\'ajouter celle détectée', () => {
    expect(slugOf('devis.DOCX', 'docx')).toBe('devis');
  });

  it('remplace les suites de caractères spéciaux par un seul tiret', () => {
    expect(slugOf('Ma  facture (2024)!!.pdf', 'pdf')).toBe('ma-facture-2024');
  });

  it('ignore les séparateurs de chemin (garde le basename)', () => {
    expect(slugOf('../../etc/passwd.pdf', 'pdf')).toBe('passwd');
    expect(slugOf('C:\\Users\\ilan\\facture.pdf', 'pdf')).toBe('facture');
  });

  it('retombe sur "fichier" quand il ne reste rien d\'exploitable', () => {
    expect(slugOf('___.pdf', 'pdf')).toBe('fichier');
    expect(slugOf('.pdf', 'pdf')).toBe('fichier');
  });

  it('tronque les noms très longs', () => {
    const long = 'a'.repeat(200) + '.pdf';
    expect(slugOf(long, 'pdf').length).toBeLessThanOrEqual(60);
  });

  it('génère un préfixe unique à chaque appel', () => {
    const a = safeStorageFileName('facture.pdf', 'pdf');
    const b = safeStorageFileName('facture.pdf', 'pdf');
    expect(a).not.toBe(b);
  });
});
