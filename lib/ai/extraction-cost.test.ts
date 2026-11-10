import { describe, expect, it } from 'vitest';
import { estimateExtractionCost, SURCHARGE_EUR, SURCHARGE_THRESHOLD_EUR, planDebit, surchargeForCost } from './extraction-cost';

const RATE = 0.92;

describe('estimateExtractionCost', () => {
  it('coûte plus cher avec plus de tokens de documents', () => {
    const small = estimateExtractionCost({ documentTokens: 30_000, model: 'claude-sonnet-5-5', pipeline: 'sa', usdToEurRate: RATE });
    const large = estimateExtractionCost({ documentTokens: 300_000, model: 'claude-sonnet-5-5', pipeline: 'sa', usdToEurRate: RATE });
    expect(small.costEur).not.toBeNull();
    expect(large.costEur!).toBeGreaterThan(small.costEur!);
  });

  it('reproduit les coûts réels mesurés (2 appels, ~0,14 à 0,23 $)', () => {
    // documents déduits des tokens totaux réels : total - prompts - sorties (~24K)
    const cases: [number, number][] = [[15_400, 0.17], [16_500, 0.18], [34_600, 0.23], [11_700, 0.14], [9_800, 0.15]];
    for (const [documentTokens, realUsd] of cases) {
      const { costUsd } = estimateExtractionCost({ documentTokens, model: 'claude-sonnet-5-5', pipeline: 'sa', usdToEurRate: RATE });
      expect(Math.abs(costUsd! - realUsd)).toBeLessThan(0.03);
    }
  });

  it('un dossier réel typique reste très en dessous du seuil', () => {
    const { costEur } = estimateExtractionCost({ documentTokens: 35_000, model: 'claude-sonnet-5-5', pipeline: 'sa', usdToEurRate: RATE });
    expect(costEur!).toBeLessThan(SURCHARGE_THRESHOLD_EUR / 2);
  });

  it('un petit dossier reste sous le seuil, un très gros le dépasse', () => {
    const small = estimateExtractionCost({ documentTokens: 30_000, model: 'claude-sonnet-5-5', pipeline: 'sa', usdToEurRate: RATE });
    const large = estimateExtractionCost({ documentTokens: 400_000, model: 'claude-sonnet-5-5', pipeline: 'sa', usdToEurRate: RATE });
    expect(surchargeForCost(small.costEur)).toBe(0);
    expect(surchargeForCost(large.costEur)).toBe(SURCHARGE_EUR);
  });

  it("n'applique rien aux modèles autres que Sonnet 5.5", () => {
    for (const model of ['claude-sonnet-4-6', 'claude-sonnet-5', 'deepseek-flash']) {
      const result = estimateExtractionCost({ documentTokens: 1_000_000, model, pipeline: 'sa', usdToEurRate: RATE });
      expect(result).toEqual({ costUsd: null, costEur: null });
      expect(surchargeForCost(result.costEur)).toBe(0);
    }
  });
});

describe('surchargeForCost', () => {
  it('applique le supplément à partir de 0,75 € inclus', () => {
    expect(surchargeForCost(0.74)).toBe(0);
    expect(surchargeForCost(0.75)).toBe(SURCHARGE_EUR);
    expect(surchargeForCost(2)).toBe(SURCHARGE_EUR);
  });
});

describe('planDebit', () => {
  it('ajoute le supplément (0,80 €) au tarif quand le coût atteint le seuil', () => {
    const plan = planDebit({ tarif: 2, credits: 10, costEur: 0.9 });
    expect(plan.surcharge).toBe(0.8);
    expect(plan.totalDebit).toBe(2.8);
    expect(plan.sufficient).toBe(true);
  });

  it('refuse quand le solde couvre le tarif mais pas le supplément', () => {
    const plan = planDebit({ tarif: 2, credits: 2.5, costEur: 0.9 });
    expect(plan.totalDebit).toBe(2.8);
    expect(plan.sufficient).toBe(false);
  });

  it('accepte un solde exactement égal au débit total', () => {
    expect(planDebit({ tarif: 2, credits: 2.8, costEur: 1 }).sufficient).toBe(true);
  });

  it("n'ajoute rien sous le seuil", () => {
    const plan = planDebit({ tarif: 2, credits: 2, costEur: 0.3 });
    expect(plan.totalDebit).toBe(2);
    expect(plan.sufficient).toBe(true);
  });
});
