/**
 * Tarifs Claude et calcul du coût d'un appel.
 *
 * SOURCE UNIQUE DES PRIX. Aucun tarif ne doit être écrit ailleurs dans le
 * projet : c'est ici qu'on met à jour une grille Anthropic ou qu'on ajoute un
 * modèle. Un modèle absent de la table donne un coût `null` (inconnu), jamais
 * un tarif de repli — un chiffre faux est pire qu'un chiffre absent.
 */

export type ClaudeCallUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export type ModelPricing = {
  /** USD par million de tokens d'entrée. */
  inputPerMTok: number;
  /** USD par million de tokens de sortie. */
  outputPerMTok: number;
};

/** Écriture de cache : 1,25 × le tarif d'entrée. */
export const CACHE_WRITE_MULTIPLIER = 1.25;
/** Lecture de cache : 0,10 × le tarif d'entrée. */
export const CACHE_READ_MULTIPLIER = 0.1;

/** Grille publique Anthropic, en USD par million de tokens. */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-sonnet-4-5-20250929': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-3-7-sonnet-20250219': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-3-5-sonnet-20241022': { inputPerMTok: 3, outputPerMTok: 15 },
};

export function isKnownModelPricing(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODEL_PRICING, model);
}

/** Un compteur absent ou non fini vaut zéro : jamais de NaN dans un coût. */
function tokens(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Coût USD d'un appel, ou `null` si le tarif du modèle est inconnu.
 * Les tokens de réflexion (thinking) sont déjà comptés par l'API dans
 * `outputTokens` : aucun traitement particulier.
 */
export function computeCallCostUsd(usage: ClaudeCallUsage): number | null {
  const pricing = MODEL_PRICING[usage.model];
  if (!pricing) return null;

  const input =
    tokens(usage.inputTokens)
    + tokens(usage.cacheCreationInputTokens) * CACHE_WRITE_MULTIPLIER
    + tokens(usage.cacheReadInputTokens) * CACHE_READ_MULTIPLIER;

  return (input * pricing.inputPerMTok + tokens(usage.outputTokens) * pricing.outputPerMTok) / 1_000_000;
}
