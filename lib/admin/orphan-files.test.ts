import { describe, expect, it } from 'vitest';
import { groupOrphansByBucket, summarizeOrphans, type OrphanFileRow } from './orphan-files';

function file(overrides: Partial<OrphanFileRow> = {}): OrphanFileRow {
  return {
    organization_id: 'org-1',
    bucket_id: 'templates',
    name: 'org-1/abc-template.docx',
    bytes: 1000,
    ...overrides,
  };
}

describe('summarizeOrphans', () => {
  it('totalise le nombre de fichiers et l’espace récupérable', () => {
    const summary = summarizeOrphans([
      file({ bytes: 1000 }),
      file({ bytes: 2500 }),
    ]);

    expect(summary.files).toBe(2);
    expect(summary.bytes).toBe(3500);
  });

  it('rend un total nul sans fichier', () => {
    expect(summarizeOrphans([])).toEqual({ files: 0, bytes: 0 });
  });

  it('traite une taille illisible comme zéro plutôt que NaN', () => {
    const summary = summarizeOrphans([{ ...file(), bytes: null }] as unknown as OrphanFileRow[]);

    expect(summary.files).toBe(1);
    expect(summary.bytes).toBe(0);
  });
});

describe('groupOrphansByBucket', () => {
  it('regroupe les clés par bucket : une suppression par bucket, pas par fichier', () => {
    const groups = groupOrphansByBucket([
      file({ bucket_id: 'templates', name: 'a.docx' }),
      file({ bucket_id: 'templates', name: 'b.docx' }),
      file({ bucket_id: 'propositions', name: 'c.pdf' }),
    ]);

    expect(groups).toEqual([
      { bucket: 'templates', keys: ['a.docx', 'b.docx'] },
      { bucket: 'propositions', keys: ['c.pdf'] },
    ]);
  });

  it('découpe en lots pour ne pas envoyer une requête sans borne', () => {
    // L'API Storage accepte une liste par appel ; 192 fichiers sur une seule
    // organisation ont été constatés, et rien ne borne ce nombre.
    const files = Array.from({ length: 250 }, (_, i) => file({ name: `f${i}.docx` }));

    const groups = groupOrphansByBucket(files, 100);

    expect(groups).toHaveLength(3);
    expect(groups[0].keys).toHaveLength(100);
    expect(groups[2].keys).toHaveLength(50);
    expect(groups.every((g) => g.bucket === 'templates')).toBe(true);
  });

  it('ne rend aucun lot sans fichier', () => {
    expect(groupOrphansByBucket([])).toEqual([]);
  });
});
