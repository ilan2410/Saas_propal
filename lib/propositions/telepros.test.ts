import { describe, expect, it } from 'vitest';
import { parseTeleprospecteurInput, parseTeleprospecteurPatch } from './telepros';

describe('parseTeleprospecteurInput', () => {
  it('normalise un télépro valide', () => {
    expect(parseTeleprospecteurInput({ prenom: '  Léa ', nom: 'Martin', email: '', telephone: ' 0600000000 ' })).toEqual({
      prenom: 'Léa',
      nom: 'Martin',
      email: null,
      telephone: '0600000000',
    });
  });

  it('exige au moins un prénom ou un nom', () => {
    expect(() => parseTeleprospecteurInput({ prenom: '', nom: '' })).toThrow('Le prénom ou le nom est requis');
  });

  it('n’accepte actif que pour une mise à jour autorisée', () => {
    expect(parseTeleprospecteurInput({ prenom: 'Léa', nom: '', actif: false })).not.toHaveProperty('actif');
    expect(parseTeleprospecteurInput({ prenom: 'Léa', nom: '', actif: false }, true)).toMatchObject({ actif: false });
  });
});

describe('parseTeleprospecteurPatch', () => {
  it('ne touche pas email/telephone si les clés sont absentes', () => {
    const patch = parseTeleprospecteurPatch({ prenom: 'Léa', nom: 'Martin', actif: false });
    expect(patch).toEqual({ prenom: 'Léa', nom: 'Martin', actif: false });
    expect(patch).not.toHaveProperty('email');
    expect(patch).not.toHaveProperty('telephone');
  });

  it('met à jour email/telephone quand les clés sont envoyées', () => {
    expect(parseTeleprospecteurPatch({ prenom: 'Léa', nom: '', email: 'a@b.co', telephone: '' }))
      .toMatchObject({ email: 'a@b.co', telephone: null });
  });
});
