import { describe, expect, it } from 'vitest';
import { ClaudeCallError, usageFromError } from './claude-errors';
import type { ClaudeCallUsage } from './claude-pricing';

const usage: ClaudeCallUsage = {
  model: 'claude-sonnet-4-6',
  inputTokens: 500_000,
  outputTokens: 64_000,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
};

describe('ClaudeCallError', () => {
  it('transporte la consommation d’un appel déjà facturé', () => {
    // Quand la sortie structurée est tronquée, l'appel a ete facture en entier :
    // perdre son usage revient a sous-estimer la depense reelle.
    const error = new ClaudeCallError('sortie structurée absente', usage);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('sortie structurée absente');
    expect(usageFromError(error)).toEqual(usage);
  });

  it('ne rend aucune consommation pour une erreur ordinaire', () => {
    expect(usageFromError(new Error('réseau'))).toBeNull();
    expect(usageFromError('pas une erreur')).toBeNull();
    expect(usageFromError(null)).toBeNull();
  });
});
