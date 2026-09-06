export const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Recommandé)', legacy: false },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Thinking adaptatif)', legacy: false },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (Legacy)', legacy: true },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude Sonnet 3.7 (Legacy)', legacy: true },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude Sonnet 3.5 (Legacy)', legacy: true },
] as const;

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';

export function buildClaudeModelOptions(model: string) {
  if (model === 'claude-sonnet-5') {
    return { thinking: { type: 'adaptive' as const } };
  }
  return { temperature: 0 };
}

export function getClaudeMaxOutputTokens(model: string, requested: number): number {
  if (model.startsWith('claude-3-')) return Math.min(requested, 8192);
  // Sonnet 4.5 supporte jusqu'à 64k tokens de sortie : l'ancien plafond à 16000
  // tronquait le JSON structuré des gros dossiers SA.
  if (model.includes('sonnet-4-5')) return Math.min(requested, 64000);
  return requested;
}
