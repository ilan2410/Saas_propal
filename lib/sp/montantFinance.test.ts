import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPOSANTES_BASE_LOYER,
  DEFAULT_CONFIG_LOYER,
  calculerBaseLoyer,
  calculerMontantAnneeLissee,
  calculerMontantFinance,
} from './calculLoyer';
import { isLibelleVisible, resolveLibelle } from './libelles';

describe('calculerMontantFinance', () => {
  it('retrouve le capital à partir du loyer et du taux du barème (6,5 %)', () => {
    expect(calculerMontantFinance({ loyer_mensuel: 110, taux_utilise: 0.065 })).toBe(5076.92);
  });

  it('part du loyer arrondi, donc peut dépasser la base loyer', () => {
    expect(calculerMontantFinance({ loyer_mensuel: 65, taux_utilise: 0.063 })).toBe(3095.24);
  });

  it('respecte le diviseur configuré', () => {
    expect(
      calculerMontantFinance(
        { loyer_mensuel: 100, taux_utilise: 0.06 },
        { diviseur: 1, arrondi: 'aucun', decimales: 0 },
      ),
    ).toBe(1666.67);
  });

  it('renvoie null sans loyer ou sans taux exploitable', () => {
    expect(calculerMontantFinance(null)).toBeNull();
    expect(calculerMontantFinance({ loyer_mensuel: 65, taux_utilise: 0 })).toBeNull();
  });
});

describe('calculerMontantAnneeLissee', () => {
  it('multiplie le total mensuel par 12 par défaut', () => {
    expect(calculerMontantAnneeLissee(106.8)).toBe(1281.6);
  });

  it('utilise le multiplicateur du template', () => {
    expect(calculerMontantAnneeLissee(106.8, 10)).toBe(1068);
  });

  it('retombe sur 12 si le multiplicateur est invalide', () => {
    expect(calculerMontantAnneeLissee(100, 0)).toBe(1200);
    expect(calculerMontantAnneeLissee(100, Number.NaN)).toBe(1200);
  });
});

describe('base financée et montant année lissée', () => {
  const composantes = {
    materiel: 1000, cadeaux: 0, installations: 0, fas: 0, autres_ponctuels: 0,
    mois_offerts: 0, indemnites: 0, marge: 0, annee_lissee: 1281.6,
  };

  it('n\'inclut pas le montant année lissée par défaut', () => {
    expect(calculerBaseLoyer(composantes)).toBe(1000);
  });

  it('l\'inclut quand la composante est cochée', () => {
    expect(
      calculerBaseLoyer(composantes, { ...DEFAULT_CONFIG_LOYER, composantes_base: { ...DEFAULT_COMPOSANTES_BASE_LOYER, annee_lissee: true } }),
    ).toBeCloseTo(2281.6, 2);
  });
});

describe('libellés SP', () => {
  it('utilise les valeurs par défaut sans personnalisation', () => {
    expect(resolveLibelle(undefined, 'fas')).toBe('FAS');
    expect(isLibelleVisible(undefined, 'base_loyer')).toBe(true);
  });

  it('masque « Montant financé » tant qu\'il n\'est pas activé', () => {
    expect(isLibelleVisible(undefined, 'montant_finance')).toBe(false);
    expect(isLibelleVisible({ montant_finance: { visible: true } }, 'montant_finance')).toBe(true);
  });

  it('applique le libellé personnalisé et ignore un libellé vide', () => {
    expect(resolveLibelle({ fas: { label: 'FMS' } }, 'fas')).toBe('FMS');
    expect(resolveLibelle({ fas: { label: '  ' } }, 'fas')).toBe('FAS');
    expect(isLibelleVisible({ base_loyer: { visible: false } }, 'base_loyer')).toBe(false);
  });
});
