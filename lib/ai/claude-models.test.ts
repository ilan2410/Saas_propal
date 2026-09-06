import { describe, expect, it } from 'vitest';
import { buildClaudeModelOptions, CLAUDE_MODELS, getClaudeMaxOutputTokens } from './claude-models';

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
});
