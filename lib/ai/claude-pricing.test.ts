import { describe, expect, it } from 'vitest';
import { computeCallCostUsd, isKnownModelPricing, type ClaudeCallUsage } from './claude-pricing';

function usage(overrides: Partial<ClaudeCallUsage> = {}): ClaudeCallUsage {
  return {
    model: 'claude-sonnet-4-6',
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    ...overrides,
  };
}

describe('computeCallCostUsd', () => {
  it('facture entrée et sortie au tarif du modèle', () => {
    // Sonnet 4.6 : 3 $/MTok en entrée, 15 $/MTok en sortie.
    // 100 000 × 3/1e6 = 0,30 ; 20 000 × 15/1e6 = 0,30
    const cost = computeCallCostUsd(usage({ inputTokens: 100_000, outputTokens: 20_000 }));
    expect(cost).toBeCloseTo(0.6, 10);
  });

  it('applique les multiplicateurs de cache sur le tarif d’entrée', () => {
    // écriture 100 000 × 3/1e6 × 1,25 = 0,375
    // lecture  200 000 × 3/1e6 × 0,10 = 0,06
    const cost = computeCallCostUsd(
      usage({ cacheCreationInputTokens: 100_000, cacheReadInputTokens: 200_000 }),
    );
    expect(cost).toBeCloseTo(0.435, 10);
  });

  it('applique des tarifs différents selon le modèle', () => {
    const sonnet46 = computeCallCostUsd(usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }));
    const sonnet5 = computeCallCostUsd(
      usage({ model: 'claude-sonnet-5', inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    );
    expect(sonnet46).toBeCloseTo(18, 10);
    expect(sonnet5).toBeCloseTo(12, 10);
  });

  it('rend null pour un modèle au tarif inconnu, jamais zéro', () => {
    const cost = computeCallCostUsd(
      usage({ model: 'claude-modele-inexistant', inputTokens: 500_000, outputTokens: 10_000 }),
    );
    expect(cost).toBeNull();
    expect(isKnownModelPricing('claude-modele-inexistant')).toBe(false);
    expect(isKnownModelPricing('claude-sonnet-4-6')).toBe(true);
  });

  it('ne facture pas DeepSeek aux tarifs ni aux multiplicateurs de cache Anthropic', () => {
    expect(computeCallCostUsd(usage({ model: 'deepseek-flash', inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 100 }))).toBeNull();
  });

  it('rend 0 pour un usage entièrement nul sur un modèle connu', () => {
    expect(computeCallCostUsd(usage())).toBe(0);
  });

  it('traite des compteurs manquants comme zéro sans produire NaN', () => {
    // Le SDK type les champs de cache nullable : une valeur absente arrive
    // parfois en undefined malgré le type.
    const incomplet = {
      model: 'claude-sonnet-4-6',
      inputTokens: 1_000_000,
      outputTokens: undefined,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: null,
    } as unknown as ClaudeCallUsage;
    expect(computeCallCostUsd(incomplet)).toBeCloseTo(3, 10);
  });

  it('couvre tous les modèles proposés à la sélection', async () => {
    const { CLAUDE_MODELS } = await import('./claude-models');
    for (const model of CLAUDE_MODELS) {
      expect(isKnownModelPricing(model.value)).toBe(true);
    }
  });
});
