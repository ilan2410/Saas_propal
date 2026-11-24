import { describe, expect, it } from 'vitest';
import {
  addMonthsIso,
  calculerIndemnite,
  calculerIndemniteEngagements,
  computeEngagementEnd,
  computeMoisRestants,
  monthsBetweenIso,
} from './indemnite-calculette';

describe('dates d\'engagement', () => {
  it('ajoute des mois en plafonnant au dernier jour du mois', () => {
    expect(addMonthsIso('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsIso('2022-09-22', 63)).toBe('2027-12-22');
    expect(addMonthsIso('2026-11-15', -12)).toBe('2025-11-15');
    expect(addMonthsIso('pas-une-date', 3)).toBeNull();
    expect(addMonthsIso('2026-02-30', 3)).toBeNull();
  });

  it('calcule la fin d\'engagement depuis début + durée', () => {
    expect(computeEngagementEnd('2022-09-22', 63)).toBe('2027-12-22');
    expect(computeEngagementEnd('2022-09-22', 0)).toBeNull();
  });

  it('compte les mois complets entre deux dates', () => {
    expect(monthsBetweenIso('2026-09-22', '2027-09-22')).toBe(12);
    expect(monthsBetweenIso('2026-09-22', '2027-09-21')).toBe(11);
    expect(monthsBetweenIso('2026-09-30', '2026-10-01')).toBe(0);
    expect(monthsBetweenIso('2026-11-24', '2026-10-24')).toBe(-1);
  });

  it('déduit le préavis et signale les cas limites', () => {
    expect(computeMoisRestants('2026-11-24', '2027-09-22', 3)).toMatchObject({ moisAvantPreavis: 9, moisRestants: 6, depasse: false });
    expect(computeMoisRestants('2026-11-24', '2027-01-24', 3)).toMatchObject({ moisRestants: 0, preavisCouvreTout: true });
    expect(computeMoisRestants('2026-11-24', '2026-01-24', 3)).toMatchObject({ moisRestants: 0, depasse: true });
    expect(computeMoisRestants('2026-11-24', '', 3)).toBeNull();
  });
});

describe('calculerIndemniteEngagements', () => {
  const frais = { fraisFixes: 150, penalites: 0, fraisMateriel: 0, servicesAnnexes: 0 };

  it('additionne chaque engagement avec ses propres mois restants', () => {
    const r = calculerIndemniteEngagements([
      { libelle: 'Mobile', mensuel: 100, moisRestants: 10 },
      { libelle: 'Fixe', mensuel: 50, moisRestants: 4 },
    ], frais);
    expect(r.total).toBe(1000 + 200 + 150);
    expect(r.lignes.map((l) => l.libelle)).toEqual(['Mensualités — Mobile', 'Mensualités — Fixe', 'Frais fixes de résiliation']);
  });

  it('ignore un engagement sans date de fin mais garde les frais', () => {
    const r = calculerIndemniteEngagements([{ libelle: 'X', mensuel: 80, moisRestants: null }], frais);
    expect(r.total).toBe(150);
  });
});

describe('calculerIndemnite', () => {
  const montants = {
    mensuel: 208.15,
    fraisFixes: 0,
    penalites: 0,
    fraisMateriel: 0,
    servicesAnnexes: 0,
  };

  it('détaille le montant mensuel multiplié par les mois après préavis', () => {
    const resultat = calculerIndemnite(10, montants);
    expect(resultat.lignes).toEqual([{
      libelle: 'Mensualités restantes',
      calcul: '208.15 € × 10 mois',
      montant: 2081.5,
    }]);
    expect(resultat.total).toBe(2081.5);
  });

  it('ajoute uniquement les frais et pénalités renseignés au détail et au total', () => {
    const resultat = calculerIndemnite(10, {
      ...montants, fraisFixes: 49, penalites: 25, fraisMateriel: 12, servicesAnnexes: 8,
    });
    expect(resultat.lignes.map((ligne) => [ligne.libelle, ligne.montant])).toEqual([
      ['Mensualités restantes', 2081.5],
      ['Frais fixes de résiliation', 49],
      ['Pénalités', 25],
      ['Frais matériel', 12],
      ['Services annexes', 8],
    ]);
    expect(resultat.total).toBe(2175.5);
  });

  it('ne compte pas les mensualités sans date de fin et garde les frais saisis', () => {
    expect(calculerIndemnite(null, { ...montants, fraisFixes: 49 })).toEqual({
      lignes: [{ libelle: 'Frais fixes de résiliation', calcul: null, montant: 49 }],
      total: 49,
    });
  });
});
