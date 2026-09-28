import type { ClaudeCallUsage } from '@/lib/ai/claude-pricing';

/**
 * Échec survenu APRÈS que l'appel Claude a été facturé.
 *
 * Une sortie structurée tronquée fait échouer la validation alors qu'Anthropic
 * a déjà facturé l'appel en entier. Sans ce transport de `usage`, la dépense la
 * plus lourde disparaîtrait précisément dans son mode d'échec le plus probable.
 */
export class ClaudeCallError extends Error {
  readonly usage: ClaudeCallUsage;

  constructor(message: string, usage: ClaudeCallUsage) {
    super(message);
    this.name = 'ClaudeCallError';
    this.usage = usage;
  }
}

/** Consommation portée par une erreur, ou `null` si l'appel n'a pas été facturé. */
export function usageFromError(error: unknown): ClaudeCallUsage | null {
  return error instanceof ClaudeCallError ? error.usage : null;
}
