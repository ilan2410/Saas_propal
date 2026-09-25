import { describe, expect, it } from 'vitest';
import { resolvePropositionClientName } from './clientName';

describe('resolvePropositionClientName', () => {
  it('privilégie l\'entreprise quand elle est présente', () => {
    expect(resolvePropositionClientName({ client: { nom: 'Carosio', raison_sociale: 'Carosio SAS' } })).toBe('Carosio SAS');
    expect(resolvePropositionClientName({ 'client.nom': 'Dupont', raison_sociale: 'Dupont SARL' })).toBe('Dupont SARL');
  });

  it('retombe sur le contact quand aucune entreprise n\'est extraite', () => {
    expect(resolvePropositionClientName({ client: { nom: 'Carosio' } })).toBe('Carosio');
    expect(resolvePropositionClientName({ 'client.prenom': 'Jean', 'client.nom': 'Gentil' })).toBe('Gentil');
    expect(resolvePropositionClientName({ client: { societe: 'Copieurs Pro' } })).toBe('Copieurs Pro');
  });

  it('gère les clés à plat et donne priorité au nom_client modifié', () => {
    expect(resolvePropositionClientName({ 'client.raison_sociale': 'Flat Corp' })).toBe('Flat Corp');
    expect(resolvePropositionClientName({}, 'Nom saisi manuellement')).toBe('Nom saisi manuellement');
    expect(resolvePropositionClientName({ client: { nom: 'Nom extrait' } }, 'Nom modifié')).toBe('Nom modifié');
  });

  it('utilise le placeholder quand tout est vide', () => {
    expect(resolvePropositionClientName(null)).toBe('Sans nom');
    expect(resolvePropositionClientName({}, undefined, 'Proposition sans nom')).toBe('Proposition sans nom');
  });
});
