import type { SpBareme, SpQuestionReponse, CatalogueProduit } from '@/types';
import { evaluateQuestionVisibility } from './evaluateConditions';

/**
 * Finds the first applicable barème for the given context.
 * Barèmes are evaluated in ascending `ordre` order.
 * A barème without conditions always matches (fallback).
 * Returns null if no barème is defined.
 */
export function findApplicableBareme(
  baremes: SpBareme[],
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
  catalogue?: CatalogueProduit[],
): SpBareme | null {
  if (!baremes || baremes.length === 0) return null;

  const sorted = [...baremes].sort((a, b) => a.ordre - b.ordre);

  for (const bareme of sorted) {
    const hasConditions =
      bareme.groupes_conditions && bareme.groupes_conditions.length > 0;

    if (!hasConditions) return bareme;

    // Reuse evaluateQuestionVisibility by shaping bareme as a SpQuestion-like object
    const matches = evaluateQuestionVisibility(
      {
        id: bareme.id,
        groupes_conditions: bareme.groupes_conditions,
        logique_declencheur: bareme.logique_declencheur,
      } as Parameters<typeof evaluateQuestionVisibility>[0],
      reponses,
      donneesExtraites,
      catalogue,
    );

    if (matches) return bareme;
  }

  return null;
}
