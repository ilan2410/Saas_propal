import { describe, expect, it } from 'vitest';
import { resolvePropositionClientName } from './clientName';

describe('resolvePropositionClientName', () => {
  it('privilégie le contact quand il est présent', () => {
    expect(resolvePropositionClientName({ client: { nom: 'Carosio', raison_sociale: 'Carosio SAS' } })).toBe('Carosio');
    expect(resolvePropositionClientName({ 'client.prenom': 'Jean', 'client.nom': 'Gentil' })).toBe('Gentil');
  });

  it('retombe sur la raison sociale quand aucun contact n\'est extrait (cas "Sans nom")', () => {
    expect(resolvePropositionClientName({ client: { nom: '', raison_sociale: 'E-Mag Package SARL' } })).toBe('E-Mag Package SARL');
    expect(resolvePropositionClientName({ client: { societe: 'Copieurs Pro' } })).toBe('Copieurs Pro');
  });

  it('gère les clés à plat et la colonne nom_client', () => {
    expect(resolvePropositionClientName({ 'client.raison_sociale': 'Flat Corp' })).toBe('Flat Corp');
    expect(resolvePropositionClientName({}, 'Nom saisi manuellement')).toBe('Nom saisi manuellement');
  });

  it('utilise le placeholder quand tout est vide', () => {
    expect(resolvePropositionClientName(null)).toBe('Sans nom');
    expect(resolvePropositionClientName({}, undefined, 'Proposition sans nom')).toBe('Proposition sans nom');
  });
});
