import { describe, expect, it } from 'vitest';
import type { SpConfigLoyer, SpMargeOperande, SpMargeOperateur } from '@/types';
import { calculateCartSummary } from './calculateCart';
import { DEFAULT_CONFIG_LOYER, DEFAULT_COMPOSANTES_BASE_LOYER } from './calculLoyer';
import { synchroniserMargeAuto, validerFormuleMarge } from './calculMargeAuto';

const auto = (operandes: SpMargeOperande[], operateurs: SpMargeOperateur[], margeIncluse = false): SpConfigLoyer => ({
  ...DEFAULT_CONFIG_LOYER,
  composantes_base: { ...DEFAULT_COMPOSANTES_BASE_LOYER, marge: margeIncluse },
  widget_marge: { mode: 'automatique', visible_auto: false, operandes, operateurs },
});

describe('marge automatique du panier SP', () => {
  it('calcule montant financé moins base loyer sans réinjecter la marge lorsque désactivée', () => {
    const config = auto(['montant_finance', 'base_loyer'], ['-']);
    const summary = calculateCartSummary([
      { question_id: 'sp_marge_calculee', valeur: '500' },
      { question_id: 'sp_total_indemnites', valeur: '900' },
    ], [], [], {}, config);
    expect(summary.baseLoyer).toBe(900);
    expect(summary.loyer?.loyer_mensuel).toBe(19);
    expect(summary.marge).toBe(4.76);
    expect(calculateCartSummary([], [], [], {}, config).marge).toBe(0);
  });

  it('retrouve les 28,58 € de l’exemple avec un barème à 6,5 %', () => {
    const config = auto(['montant_finance', 'base_loyer'], ['-']);
    config.baremes = [{
      ...DEFAULT_CONFIG_LOYER.baremes[0],
      taux_durees: [{ duree_mois: 63, taux_loyer: 0.065, mois_offerts: 0, trimestres: 21 }],
    }];
    const summary = calculateCartSummary([
      { question_id: 'sp_total_indemnites', valeur: '3386.8' },
    ], [], [], {}, config);
    expect(summary.loyer?.loyer_mensuel).toBe(74);
    expect(summary.marge).toBe(28.58);
    expect(summary.baseLoyer).toBe(3386.8);
  });

  it('respecte la priorité des opérateurs et accepte une marge négative', () => {
    const config = auto(
      ['indemnites', 'loyer_total_ponctuel', 'base_loyer', 'indemnites'],
      ['-', '*', '/'],
    );
    const summary = calculateCartSummary([{ question_id: 'sp_total_indemnites', valeur: '100' }], [], [], {}, config);
    expect(summary.marge).toBe(100);
    const negative = calculateCartSummary([{ question_id: 'sp_total_indemnites', valeur: '100' }], [], [], {},
      auto(['loyer_total_ponctuel', 'indemnites'], ['-']));
    expect(negative.marge).toBe(-100);
  });

  it('autorise les champs dépendant du loyer uniquement si la marge est exclue de la base', () => {
    expect(validerFormuleMarge(auto(['montant_finance', 'base_loyer'], ['-'], true))).toMatch(/Décochez/);
    expect(validerFormuleMarge(auto(['loyer_total_ponctuel', 'indemnites'], ['-'], true))).toBeNull();
    const summary = calculateCartSummary(
      [{ question_id: 'sp_total_indemnites', valeur: '100' }], [], [], {},
      auto(['indemnites', 'loyer_total_ponctuel'], ['+'], true),
    );
    expect(summary.marge).toBe(100);
    expect(summary.baseLoyer).toBe(200);
    expect(summary.loyer?.loyer_mensuel).toBe(5);
  });

  it('conserve le calcul manuel par défaut', () => {
    const summary = calculateCartSummary([{ question_id: 'sp_marge_calculee', valeur: '25' }], [], []);
    expect(summary.marge).toBe(25);
    expect(summary.baseLoyer).toBe(25);
  });

  it('signale une division par zéro sans utiliser une ancienne marge saisie', () => {
    const config = auto(['indemnites', 'loyer_total_ponctuel'], ['/']);
    const summary = calculateCartSummary([{ question_id: 'sp_marge_calculee', valeur: '123' }], [], [], {}, config);
    expect(summary.margeErreur).toMatch(/Division par zéro/);
    expect(summary.marge).toBe(0);
  });

  describe('loyer saisi manuellement (marge automatique)', () => {
    const config65 = () => {
      const config = auto(['montant_finance', 'base_loyer'], ['-']);
      config.baremes = [{
        ...DEFAULT_CONFIG_LOYER.baremes[0],
        taux_durees: [{ duree_mois: 63, taux_loyer: 0.065, mois_offerts: 0, trimestres: 21 }],
      }];
      return config;
    };
    const indemnites = { question_id: 'sp_total_indemnites', valeur: '3386.8' };

    it('recalcule trimestriel, montant financé et marge sans toucher à la base loyer', () => {
      const summary = calculateCartSummary(
        [indemnites, { question_id: 'sp_loyer_manuel', valeur: '80' }], [], [], {}, config65(),
      );
      expect(summary.loyer?.loyer_mensuel).toBe(80);
      expect(summary.loyer?.loyer_trimestriel).toBe(240);
      expect(summary.loyer?.loyer_calcule).toBe(74);
      expect(summary.baseLoyer).toBe(3386.8);
      expect(summary.marge).toBe(305.51);
      expect(summary.totalMensuelFinal).toBe(80);
    });

    it('autorise une marge négative quand le loyer saisi est plus bas', () => {
      const summary = calculateCartSummary(
        [indemnites, { question_id: 'sp_loyer_manuel', valeur: '70' }], [], [], {}, config65(),
      );
      expect(summary.marge).toBe(-156.03);
    });

    it('garde le loyer saisi quand la base change', () => {
      const summary = calculateCartSummary(
        [{ question_id: 'sp_total_indemnites', valeur: '5000' }, { question_id: 'sp_loyer_manuel', valeur: '80' }],
        [], [], {}, config65(),
      );
      expect(summary.loyer?.loyer_mensuel).toBe(80);
      expect(summary.marge).toBe(-1307.69);
    });

    it('ignore la saisie en marge manuelle ou si elle est invalide', () => {
      const manuel = calculateCartSummary(
        [indemnites, { question_id: 'sp_loyer_manuel', valeur: '80' }], [], [], {},
        { ...config65(), widget_marge: { mode: 'manuel' } },
      );
      expect(manuel.loyer?.loyer_calcule).toBeUndefined();
      const invalide = calculateCartSummary(
        [indemnites, { question_id: 'sp_loyer_manuel', valeur: 'abc' }], [], [], {}, config65(),
      );
      expect(invalide.loyer?.loyer_mensuel).toBe(74);
      expect(invalide.loyer?.loyer_calcule).toBeUndefined();
    });
  });

  it('synchronise les réponses dérivées, sans réécrire celles qui sont déjà à jour', () => {
    const config = auto(['indemnites', 'loyer_total_ponctuel'], ['-']);
    const previous = [
      { question_id: 'sp_marge_calculee', valeur: '999' },
      { question_id: 'marge_question__iter_0', valeur: '999' },
    ];
    const summary = calculateCartSummary([{ question_id: 'sp_total_indemnites', valeur: '100' }], [], [], {}, config);
    const next = synchroniserMargeAuto(previous, summary, ['marge_question']);
    expect(next.find((r) => r.question_id === 'sp_marge_calculee')?.valeur).toBe('100');
    expect(next.find((r) => r.question_id === 'marge_question__iter_0')?.valeur).toBe('100');
    expect(next.find((r) => r.question_id === 'sp_loyer_mensuel_calculee')?.valeur).toBe(String(summary.loyer?.loyer_mensuel));
    expect(synchroniserMargeAuto(next, summary, ['marge_question'])).toBe(next);
  });
});
