import { describe, expect, it } from 'vitest';
import { fetchAllRows } from './paginate';

describe('fetchAllRows', () => {
  it('récupère au-delà du plafond de 1000 lignes de PostgREST', async () => {
    // Sans pagination, une lecture directe est tronquée en silence à 1000 lignes
    // et le total affiché devient faux sans le moindre message.
    const total = 2500;
    const appels: Array<[number, number]> = [];

    const rows = await fetchAllRows(async (from, to) => {
      appels.push([from, to]);
      return Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => ({ n: from + i }));
    }, 1000);

    expect(rows).toHaveLength(total);
    expect(rows[0]).toEqual({ n: 0 });
    expect(rows[total - 1]).toEqual({ n: total - 1 });
    expect(appels.length).toBe(3);
  });

  it('s’arrête dès qu’une page est incomplète', async () => {
    let appels = 0;
    const rows = await fetchAllRows(async () => {
      appels += 1;
      return [{ n: 1 }];
    }, 1000);

    expect(rows).toHaveLength(1);
    expect(appels).toBe(1);
  });

  it('s’arrête sur une page vide', async () => {
    const rows = await fetchAllRows(async () => [], 1000);
    expect(rows).toEqual([]);
  });
});
