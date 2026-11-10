import { describe, expect, it } from 'vitest';
import { checkDocumentLimits, documentTokenBudget, estimateImageTokens } from './document-limits';
import { getImageDimensions } from './document-inspect';

const MB = 1024 * 1024;

describe('checkDocumentLimits', () => {
  it('accepte un petit lot', () => {
    const result = checkDocumentLimits([
      { name: 'facture.pdf', kind: 'pdf', bytes: 2 * MB, pages: 4 },
      { name: 'scan.jpg', kind: 'image', bytes: MB, width: 1200, height: 1600 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.totalPages).toBe(4);
  });

  it('refuse une image de plus de 5 Mo', () => {
    const result = checkDocumentLimits([{ name: 'gros.png', kind: 'image', bytes: 6 * MB, width: 1000, height: 1000 }]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('gros.png');
  });

  it('refuse un PDF de plus de 600 pages (modèle 1M)', () => {
    expect(checkDocumentLimits([{ name: 'long.pdf', kind: 'pdf', bytes: MB, pages: 601 }]).ok).toBe(false);
  });

  it('limite à 100 pages un modèle à 200K de contexte', () => {
    const doc = { name: 'm.pdf', kind: 'pdf' as const, bytes: MB, pages: 150 };
    expect(checkDocumentLimits([doc], { model: 'claude-sonnet-4-5-20250929' }).ok).toBe(false);
    expect(checkDocumentLimits([doc], { model: 'claude-sonnet-5-5' }).ok).toBe(true);
  });

  it('refuse un total dont la taille en base64 dépasse 32 Mo', () => {
    // 25 Mo bruts = ~33,3 Mo en base64
    const result = checkDocumentLimits([
      { name: 'a.pdf', kind: 'pdf', bytes: 13 * MB, pages: 10 },
      { name: 'b.pdf', kind: 'pdf', bytes: 12 * MB, pages: 10 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('total');
  });

  it('refuse quand les tokens estimés dépassent le budget', () => {
    // 400 pages x 2500 x 1,1 = 1,1 M tokens estimés > budget ~972K
    const result = checkDocumentLimits([{ name: 'd.pdf', kind: 'pdf' as const, bytes: MB, pages: 400 }]);
    expect(result.ok).toBe(false);
    expect(result.estimatedTokens).toBeGreaterThan(result.tokenBudget);
  });

  it('un budget plus petit (sortie 64k) est plus strict', () => {
    expect(documentTokenBudget({ maxOutputTokens: 64000 })).toBeLessThan(documentTokenBudget());
  });

  it('suppose le pire cas pour un PDF dont les pages sont illisibles', () => {
    // 600 pages supposées x 2500 tokens > budget : refus plutôt que d'ignorer le risque
    const result = checkDocumentLimits([{ name: 'x.pdf', kind: 'pdf', bytes: MB }]);
    expect(result.ok).toBe(false);
  });
});

describe('estimateImageTokens', () => {
  it('plafonne les grandes images', () => {
    expect(estimateImageTokens(4000, 3000)).toBe(1600);
    expect(estimateImageTokens(300, 300)).toBe(120);
  });
});

describe('getImageDimensions', () => {
  it('lit un PNG', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(getImageDimensions(png)).toEqual({ width: 640, height: 480 });
  });
});
