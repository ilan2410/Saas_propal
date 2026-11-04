import { describe, expect, it } from 'vitest';
import { compacterLibelles, resolveLibelle, resolveWidgetLibelle } from './libelles';

describe('titres des widgets SP', () => {
  it('garde les titres existants pour les anciens modèles', () => {
    expect(resolveWidgetLibelle(undefined, 'marge')).toBe('Marge & Loyer');
    expect(resolveWidgetLibelle(undefined, 'indemnite')).toBe('Indemnité rés.');
  });

  it('applique les titres personnalisés sans changer les lignes du panier', () => {
    const config = {
      widgets: { marge: '  Rentabilité  ', indemnite: '  Frais de sortie  ' },
      marge: { label: 'Bénéfice' },
    };
    expect(resolveWidgetLibelle(config, 'marge')).toBe('Rentabilité');
    expect(resolveWidgetLibelle(config, 'indemnite')).toBe('Frais de sortie');
    expect(resolveLibelle(config, 'marge')).toBe('Bénéfice');
    expect(compacterLibelles(config)).toEqual({
      widgets: { marge: 'Rentabilité', indemnite: 'Frais de sortie' },
      marge: { label: 'Bénéfice' },
    });
  });

  it('revient aux titres par défaut si les champs sont vides ou inchangés', () => {
    const config = { widgets: { marge: '   ', indemnite: 'Indemnité rés.' } };
    expect(resolveWidgetLibelle(config, 'marge')).toBe('Marge & Loyer');
    expect(compacterLibelles(config)).toEqual({});
  });
});
