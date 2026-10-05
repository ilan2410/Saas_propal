import { describe, expect, it } from 'vitest';
import {
  buildClaudeEffortConfig,
  buildClaudeModelOptions,
  CLAUDE_MODELS,
  DEFAULT_CLAUDE_EFFORT,
  DEFAULT_CLAUDE_MODEL,
  getClaudeMaxOutputTokens,
  STRUCTURING_CLAUDE_EFFORT,
  supportsClaudeEffort,
  SA_EXTRACTION_MODELS,
  isDeepSeekSaModel,
  isSaExtractionEligible,
} from './claude-models';

describe('Claude Sonnet model configuration', () => {
  it('active la température zéro pour Sonnet 4.6', () => {
    expect(buildClaudeModelOptions('claude-sonnet-4-6')).toEqual({ temperature: 0 });
  });

  it('active le thinking adaptatif sans température pour Sonnet 5', () => {
    const options = buildClaudeModelOptions('claude-sonnet-5');
    expect(options).toEqual({ thinking: { type: 'adaptive' } });
    expect(options).not.toHaveProperty('temperature');
  });

  it('reprend les réglages de Sonnet 5 pour Sonnet 5.5 et en fait le défaut', () => {
    expect(buildClaudeModelOptions('claude-sonnet-5-5')).toEqual({ thinking: { type: 'adaptive' } });
    expect(supportsClaudeEffort('claude-sonnet-5-5')).toBe(true);
    expect(buildClaudeEffortConfig('claude-sonnet-5-5', undefined)).toEqual({ effort: 'medium' });
    expect(DEFAULT_CLAUDE_MODEL).toBe('claude-sonnet-5-5');
    expect(CLAUDE_MODELS.some((model) => model.value === DEFAULT_CLAUDE_MODEL)).toBe(true);
  });

  it('ne propose que des modèles Sonnet', () => {
    expect(CLAUDE_MODELS.every((model) => model.value.includes('sonnet'))).toBe(true);
  });

  it('ajoute DeepSeek seulement à la sélection SA, sans changer les options Claude', () => {
    expect(SA_EXTRACTION_MODELS).toHaveLength(CLAUDE_MODELS.length + 1);
    expect(SA_EXTRACTION_MODELS.some((model) => model.value === 'deepseek-flash')).toBe(true);
    expect(CLAUDE_MODELS.some((model) => isDeepSeekSaModel(model.value))).toBe(false);
    expect(isSaExtractionEligible('telephonie', ['situation_actuelle'])).toBe(true);
    expect(isSaExtractionEligible('mixte', ['client.nom', 'situation_actuelle.lignes'])).toBe(true);
    expect(isSaExtractionEligible('mixte', ['situation_actuelle', 'materiels'])).toBe(false);
    expect(isSaExtractionEligible('bureautique', ['situation_actuelle'])).toBe(false);
  });

  it('respecte la limite de sortie des anciens Sonnet', () => {
    expect(getClaudeMaxOutputTokens('claude-3-5-sonnet-20241022', 24000)).toBe(8192);
    expect(getClaudeMaxOutputTokens('claude-sonnet-5', 24000)).toBe(24000);
  });

  it("n'applique l'effort que sur Sonnet 5", () => {
    expect(supportsClaudeEffort('claude-sonnet-5')).toBe(true);
    expect(supportsClaudeEffort('claude-sonnet-4-6')).toBe(false);
    expect(buildClaudeEffortConfig('claude-sonnet-4-6', 'low')).toEqual({});
  });

  it('retombe sur medium quand la valeur est absente ou invalide', () => {
    expect(buildClaudeEffortConfig('claude-sonnet-5', undefined)).toEqual({ effort: 'medium' });
    expect(buildClaudeEffortConfig('claude-sonnet-5', 'turbo')).toEqual({ effort: 'medium' });
    expect(buildClaudeEffortConfig('claude-sonnet-5', 'low')).toEqual({ effort: 'low' });
    expect(buildClaudeEffortConfig('claude-sonnet-5', 'high')).toEqual({ effort: 'high' });
  });

  it('impose un effort minimal à la structuration, sous le défaut de l\'analyse', () => {
    expect(STRUCTURING_CLAUDE_EFFORT).toBe('low');
    expect(DEFAULT_CLAUDE_EFFORT).toBe('medium');
    expect(buildClaudeEffortConfig('claude-sonnet-5', STRUCTURING_CLAUDE_EFFORT)).toEqual({ effort: 'low' });
  });
});
