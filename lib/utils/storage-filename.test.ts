import { describe, expect, it } from 'vitest';
import { friendlyFileNameFromUrl } from './storage-filename';

describe('friendlyFileNameFromUrl', () => {
  it('retire le préfixe UUID des fichiers récents', () => {
    expect(
      friendlyFileNameFromUrl(
        'https://x.supabase.co/storage/v1/object/public/documents/org-1/3f8a1c2e-1b2c-4d5e-8f90-a1b2c3d4e5f6-facture-orange.pdf',
      ),
    ).toBe('facture-orange.pdf');
  });

  it('décode les caractères encodés dans l\'URL', () => {
    expect(
      friendlyFileNameFromUrl('https://x/public/documents/org/3f8a1c2e-1b2c-4d5e-8f90-a1b2c3d4e5f6-devis%20final.docx'),
    ).toBe('devis final.docx');
  });

  it('retire le préfixe numérique historique', () => {
    expect(friendlyFileNameFromUrl('https://x/public/documents/org/1699999999-ancien.pdf')).toBe('ancien.pdf');
  });

  it('laisse tel quel un UUID nu (ancien fichier sans nom d\'origine)', () => {
    expect(
      friendlyFileNameFromUrl('https://x/public/documents/org/3f8a1c2e-1b2c-4d5e-8f90-a1b2c3d4e5f6.pdf'),
    ).toBe('3f8a1c2e-1b2c-4d5e-8f90-a1b2c3d4e5f6.pdf');
  });

  it('ignore la query string', () => {
    expect(
      friendlyFileNameFromUrl('https://x/public/documents/org/3f8a1c2e-1b2c-4d5e-8f90-a1b2c3d4e5f6-f.pdf?token=abc'),
    ).toBe('f.pdf');
  });

  it('retombe sur le fallback quand l\'entrée est vide', () => {
    expect(friendlyFileNameFromUrl('')).toBe('Document');
    expect(friendlyFileNameFromUrl('', 'template.docx')).toBe('template.docx');
  });

  it('accepte un simple nom de fichier sans chemin', () => {
    expect(friendlyFileNameFromUrl('3f8a1c2e-1b2c-4d5e-8f90-a1b2c3d4e5f6-rapport.xlsx')).toBe('rapport.xlsx');
  });
});
