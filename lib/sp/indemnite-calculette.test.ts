import { describe, expect, it } from 'vitest';
import { calculerIndemnite } from './indemnite-calculette';

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
