import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROPOSITION_COLUMNS,
  parsePropositionColumns,
} from './list-preferences';

describe('parsePropositionColumns', () => {
  it('retourne les colonnes par défaut pour une valeur absente', () => {
    expect(parsePropositionColumns(null)).toEqual(DEFAULT_PROPOSITION_COLUMNS);
  });

  it('ignore les colonnes inconnues et les doublons', () => {
    expect(parsePropositionColumns(['team', 'unknown', 'team', 'updatedAt'])).toEqual(['team', 'updatedAt']);
  });

  it('accepte une configuration vide', () => {
    expect(parsePropositionColumns([])).toEqual([]);
  });
});
