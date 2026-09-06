import { describe, expect, it } from 'vitest';
import {
  buildClaudeEffortConfig,
  buildClaudeModelOptions,
  CLAUDE_MODELS,
  DEFAULT_CLAUDE_EFFORT,
  getClaudeMaxOutputTokens,
  STRUCTURING_CLAUDE_EFFORT,
  supportsClaudeEffort,
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

  it('ne propose que des modèles Sonnet', () => {
    expect(CLAUDE_MODELS.every((model) => model.value.includes('sonnet'))).toBe(true);
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
