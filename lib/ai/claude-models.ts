export const CLAUDE_MODELS = [
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (Recommandé, thinking adaptatif)', legacy: false },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', legacy: false },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Thinking adaptatif)', legacy: false },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (Legacy)', legacy: true },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude Sonnet 3.7 (Legacy)', legacy: true },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude Sonnet 3.5 (Legacy)', legacy: true },
] as const;

export const DEEPSEEK_SA_MODEL = { value: 'deepseek-flash', label: 'DeepSeek V4.1 Flash (SA)', legacy: false } as const;
export const SA_EXTRACTION_MODELS = [...CLAUDE_MODELS, DEEPSEEK_SA_MODEL];

export function isDeepSeekSaModel(model: string): boolean {
  return model === DEEPSEEK_SA_MODEL.value;
}

export function isSaExtractionEligible(secteur: string, fields: string[]): boolean {
  const hasSa = fields.some((field) => field === 'situation_actuelle' || field.startsWith('situation_actuelle.'));
  return hasSa && (secteur === 'telephonie' || (secteur === 'mixte' && fields.every((field) =>
    field === 'fournisseur' || field.startsWith('fournisseur.') ||
    field === 'client' || field.startsWith('client.') ||
    field === 'situation_actuelle' || field.startsWith('situation_actuelle.'))));
}

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

/**
 * Modèles à thinking adaptatif : ils rejettent toute `temperature` non-défaut
 * (400) et exposent `output_config.effort`. Sonnet 5.5 reprend les réglages de
 * Sonnet 5 à l'identique (pas de `budget_tokens`, pas de `tool_choice` forcé ici).
 */
const ADAPTIVE_THINKING_MODELS: readonly string[] = ['claude-sonnet-5', 'claude-sonnet-5-5'];

export function buildClaudeModelOptions(model: string) {
  if (ADAPTIVE_THINKING_MODELS.includes(model)) {
    return { thinking: { type: 'adaptive' as const } };
  }
  return { temperature: 0 };
}

/**
 * Niveau d'effort (`output_config.effort`). Sur Sonnet 5 (thinking adaptatif),
 * il pilote surtout le volume de tokens de réflexion — facturés au tarif de
 * sortie — donc c'est le principal levier de coût. `medium` divise ce volume
 * par rapport au défaut `high` sans perte notable sur l'extraction.
 */
export const CLAUDE_EFFORT_LEVELS = [
  { value: 'low', label: 'Faible — le moins cher' },
  { value: 'medium', label: 'Moyen — recommandé' },
  { value: 'high', label: 'Élevé — défaut Claude, plus cher' },
] as const;

export type ClaudeEffort = (typeof CLAUDE_EFFORT_LEVELS)[number]['value'];

/** Effort par défaut de l'appel d'analyse des factures (réglable par template). */
export const DEFAULT_CLAUDE_EFFORT: ClaudeEffort = 'medium';

/**
 * Effort imposé à l'appel de structuration : tâche purement mécanique (remapping
 * du rapport dans le schéma, aucun calcul ni relecture), donc effort minimal.
 * Non réglable par template — contrairement à l'analyse des factures.
 */
export const STRUCTURING_CLAUDE_EFFORT: ClaudeEffort = 'low';

/** `output_config.effort` n'est exploité que sur les modèles à thinking adaptatif. */
export function supportsClaudeEffort(model: string): boolean {
  return ADAPTIVE_THINKING_MODELS.includes(model);
}

/**
 * Fragment `output_config` à fusionner dans l'appel Messages. Renvoie `{}` si le
 * modèle ne gère pas `effort`. `requested` vient de la config du template ; on
 * retombe sur DEFAULT_CLAUDE_EFFORT si la valeur est absente ou invalide.
 */
export function buildClaudeEffortConfig(
  model: string,
  requested?: string | null,
): { effort?: ClaudeEffort } {
  if (!supportsClaudeEffort(model)) return {};
  const isValid = CLAUDE_EFFORT_LEVELS.some((level) => level.value === requested);
  return { effort: (isValid ? requested : DEFAULT_CLAUDE_EFFORT) as ClaudeEffort };
}

export function getClaudeMaxOutputTokens(model: string, requested: number): number {
  if (model.startsWith('claude-3-')) return Math.min(requested, 8192);
  // Sonnet 4.5 supporte jusqu'à 64k tokens de sortie : l'ancien plafond à 16000
  // tronquait le JSON structuré des gros dossiers SA.
  if (model.includes('sonnet-4-5')) return Math.min(requested, 64000);
  return requested;
}
