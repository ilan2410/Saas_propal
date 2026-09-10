import { describe, expect, it } from 'vitest';
import { orderProductsByPreference } from './productTableOrder';

interface Item {
  id?: string;
  label: string;
}

const getId = (item: Item) => item.id;

describe('orderProductsByPreference', () => {
  it('préserve exactement le tableau lorsque la configuration est absente', () => {
    const items = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];

    expect(orderProductsByPreference(items, undefined, getId)).toBe(items);
    expect(orderProductsByPreference(items, [], getId)).toBe(items);
  });

  it('place les produits configurés dans l’ordre demandé', () => {
    const items = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];

    expect(orderProductsByPreference(items, ['c', 'a', 'b'], getId).map((item) => item.id))
      .toEqual(['c', 'a', 'b']);
  });

  it('conserve les produits inconnus et les saisies libres à la fin dans leur ordre initial', () => {
    const freeEntry = { label: 'Saisie libre' };
    const unknown = { id: 'new', label: 'Nouveau produit' };
    const items = [unknown, { id: 'b', label: 'B' }, freeEntry, { id: 'a', label: 'A' }];

    const result = orderProductsByPreference(items, ['a', 'b'], getId);

    expect(result).toEqual([items[3], items[1], unknown, freeEntry]);
    expect(result[2]).toBe(unknown);
    expect(result[3]).toBe(freeEntry);
  });

  it('conserve l’ordre initial entre plusieurs lignes du même produit', () => {
    const items = [
      { id: 'b', label: 'B1' },
      { id: 'a', label: 'A1' },
      { id: 'b', label: 'B2' },
      { id: 'a', label: 'A2' },
    ];

    expect(orderProductsByPreference(items, ['a', 'b'], getId).map((item) => item.label))
      .toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('ne modifie ni le tableau source ni les objets de ligne', () => {
    const first = { id: 'a', label: 'A' };
    const second = { id: 'b', label: 'B' };
    const items = [first, second];

    const result = orderProductsByPreference(items, ['b', 'a'], getId);

    expect(items).toEqual([first, second]);
    expect(result).toEqual([second, first]);
    expect(result[0]).toBe(second);
    expect(result[1]).toBe(first);
  });
});
