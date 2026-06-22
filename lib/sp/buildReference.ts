import { calculateCartSummary } from '@/lib/sp/calculateCart';
import type {
  SpConfigResumeRef,
  SpConfigLoyer,
  SpConfigMoisOfferts,
  SpPreferencesProduits,
  SpQuestion,
  SpQuestionReponse,
  CatalogueProduit,
} from '@/types';

/**
 * Construit la valeur de la variable Word {{sp_reference}} à partir des réponses
 * du questionnaire. Reproduit la logique du popup `resume_ref`
 * (cf. SpQuestionnaireUI) : partie fixe + loyer mensuel arrondi au plafond.
 *
 * Évaluée à la génération / l'aperçu, donc le loyer reflète l'état FINAL du
 * panier (toutes les réponses), contrairement au popup figé à sa position.
 *
 * Renvoie `null` si la référence n'est pas configurée (partie_fixe vide).
 */
export function buildSpReference(
  config: SpConfigResumeRef | undefined,
  reponses: SpQuestionReponse[],
  questions: SpQuestion[],
  catalogue: CatalogueProduit[],
  donneesExtraites: Record<string, unknown>,
  spConfigLoyer?: SpConfigLoyer,
  spConfigMoisOfferts?: SpConfigMoisOfferts,
  spPreferencesProduits?: SpPreferencesProduits,
): string | null {
  const fixe = config?.partie_fixe?.trim();
  if (!fixe || !config) return null;

  const partieVariable = config.partie_variable;
  let montant: number | null | undefined = undefined;
  if (partieVariable === 'loyer_avec_marge') {
    const cart = calculateCartSummary(reponses, questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts, spPreferencesProduits);
    montant = cart.loyer?.loyer_mensuel;
  } else if (partieVariable === 'loyer_sans_marge') {
    const cart = calculateCartSummary(
      reponses.filter((r) => r.question_id !== 'sp_marge_calculee'),
      questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts, spPreferencesProduits,
    );
    montant = cart.loyer?.loyer_mensuel;
  }

  return montant != null ? `${fixe}${Math.ceil(montant)}` : fixe;
}
