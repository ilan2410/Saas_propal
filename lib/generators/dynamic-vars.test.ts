import { describe, expect, it } from 'vitest';
import { resolveDynamicWordVar } from './dynamic-vars';

const createdAt = '2026-09-07T09:30:00.000Z'; // 07/09/2026

describe('resolveDynamicWordVar — sp_date_limite_souscription', () => {
  it('sans paramètre : renvoie la date de création', () => {
    expect(resolveDynamicWordVar('sp_date_limite_souscription', { createdAt })).toBe('07/09/2026');
  });

  it('avec paramètre : ajoute N jours', () => {
    expect(resolveDynamicWordVar('sp_date_limite_souscription-15', { createdAt })).toBe('22/09/2026');
    expect(resolveDynamicWordVar('sp_date_limite_souscription-20', { createdAt })).toBe('27/09/2026');
  });

  it('gère le passage de mois et d\'année', () => {
    expect(resolveDynamicWordVar('sp_date_limite_souscription-30', { createdAt: '2026-12-20T00:00:00.000Z' })).toBe(
      '19/01/2027',
    );
  });

  it('accepte un objet Date', () => {
    expect(resolveDynamicWordVar('sp_date_limite_souscription-1', { createdAt: new Date('2026-02-28T12:00:00Z') })).toBe(
      '01/03/2026',
    );
  });

  it('tolère les espaces autour de la balise', () => {
    expect(resolveDynamicWordVar('  sp_date_limite_souscription-10  ', { createdAt })).toBe('17/09/2026');
  });

  it('renvoie undefined pour une balise non concernée', () => {
    expect(resolveDynamicWordVar('sp_total_complet', { createdAt })).toBeUndefined();
    expect(resolveDynamicWordVar('sp_date_limite_souscription-', { createdAt })).toBeUndefined();
    expect(resolveDynamicWordVar('sp_date_limite_souscription-abc', { createdAt })).toBeUndefined();
    expect(resolveDynamicWordVar('sp_date_limite_souscription-15-30', { createdAt })).toBeUndefined();
  });

  it('renvoie undefined si la date de création est invalide', () => {
    expect(resolveDynamicWordVar('sp_date_limite_souscription-15', { createdAt: 'pas-une-date' })).toBeUndefined();
  });
});
