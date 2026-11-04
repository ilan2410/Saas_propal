import { describe, expect, it } from 'vitest';
import { buildSpResumeBreakdown } from './spResumeBreakdown';

const values = {
  total_mensuel: 234.60,
  fixe: 49.70,
  mobile: 110,
  internet: 74.90,
  materiel: 547,
  installations: 390,
  fas: 450,
  remise_mois_offert: 4222.80,
};

describe('résumé SP de la fiche proposition', () => {
  it('reprend les libellés du template et n’affiche pas les lignes désactivées', () => {
    const rows = buildSpResumeBreakdown(values, 17.40, 'separe', {
      total_mensuel: { label: 'Forfaits' },
      fixe: { label: 'Téléphonie fixe' },
      mobile: { visible: false },
      installations: { label: 'Mise en service', visible: false },
      materiel: { label: 'Équipements' },
      remise_mois_offert: { visible: false },
    });
    expect(rows.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'total_mensuel', label: 'Forfaits' },
      { key: 'fixe', label: 'Téléphonie fixe' },
      { key: 'internet', label: 'Internet' },
      { key: 'materiel', label: 'Équipements' },
      { key: 'fas', label: 'FAS' },
      { key: 'loyer_mensuel', label: 'Loyer matériel' },
    ]);
    expect(rows.find((row) => row.key === 'loyer_mensuel')?.value).toBe(17.40);
  });

  it('affiche le loyer dans les deux modes, avec un intitulé adapté en mode séparé', () => {
    expect(buildSpResumeBreakdown(values, 17.40, 'tout_compris')
      .find((row) => row.key === 'loyer_mensuel')?.label).toBe('Mensuel');
    expect(buildSpResumeBreakdown(values, 17.40, 'separe', { loyer_mensuel: { visible: false } })
      .some((row) => row.key === 'loyer_mensuel')).toBe(false);
    expect(buildSpResumeBreakdown(values, null, 'separe')
      .some((row) => row.key === 'loyer_mensuel')).toBe(false);
    expect(buildSpResumeBreakdown(values, 17.40, 'separe', { loyer_mensuel: { label: 'Location équipements' } })
      .find((row) => row.key === 'loyer_mensuel')?.label).toBe('Location équipements');
  });

  it('garde le total des abonnements indépendant des sous-lignes masquées', () => {
    const rows = buildSpResumeBreakdown(values, 17.40, 'separe', {
      total_mensuel: { visible: false },
      fixe: { visible: false },
    });
    expect(rows.some((row) => row.key === 'total_mensuel')).toBe(false);
    expect(rows.some((row) => row.key === 'mobile')).toBe(true);
    expect(rows.find((row) => row.key === 'loyer_mensuel')?.value).toBe(17.40);
  });

  it('reprend les composantes du loyer et affiche les lignes désactivées par défaut seulement si activées', () => {
    const withLoyer = {
      ...values,
      total_ponctuel: 1387,
      loyer_total_ponctuel: 1387,
      marge: -25,
      montant_annee_lissee: 2815.20,
      base_loyer: 4761.80,
      loyer_trimestriel: 52.20,
      montant_finance: 828.57,
    };
    const rows = buildSpResumeBreakdown(withLoyer, 17.40, 'separe', {
      marge: { label: 'Marge commerciale' },
      base_loyer: { visible: false },
      montant_annee_lissee: { label: 'Année lissée', visible: true },
      montant_finance: { label: 'Capital financé', visible: true },
      loyer_trimestriel: { visible: false },
    });
    expect(rows.filter((row) => row.section === 'loyer').map(({ key, label, value }) => ({ key, label, value }))).toEqual([
      { key: 'loyer_total_ponctuel', label: 'Total ponctuel', value: 1387 },
      { key: 'remise_mois_offert', label: 'Remise mois offert', value: 4222.80 },
      { key: 'marge', label: 'Marge commerciale', value: -25 },
      { key: 'montant_annee_lissee', label: 'Année lissée', value: 2815.20 },
      { key: 'loyer_mensuel', label: 'Loyer matériel', value: 17.40 },
      { key: 'montant_finance', label: 'Capital financé', value: 828.57 },
    ]);
    expect(rows.some((row) => row.key === 'total_ponctuel')).toBe(true);
    const defaults = buildSpResumeBreakdown(withLoyer, 17.40, 'separe');
    expect(defaults.some((row) => row.key === 'montant_annee_lissee' || row.key === 'montant_finance')).toBe(false);
    expect(defaults.find((row) => row.key === 'base_loyer')?.value).toBe(4761.80);
    expect(defaults.find((row) => row.key === 'loyer_trimestriel')?.value).toBe(52.20);
  });

  it('affiche une marge automatique nulle lorsque le panier la fournit', () => {
    const rows = buildSpResumeBreakdown({ total_mensuel: 0, marge: 0 }, 0, 'separe');
    expect(rows.find((row) => row.key === 'marge')?.value).toBe(0);
    expect(rows.find((row) => row.key === 'loyer_mensuel')?.value).toBe(0);
  });
});
