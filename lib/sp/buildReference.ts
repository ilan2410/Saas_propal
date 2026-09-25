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
 * (cf. SpQuestionnaireUI) : partie fixe + total mensuel final (abonnements et/ou
 * loyer selon `SpConfigLoyer.mode_total_mensuel`) arrondi au plafond.
 *
 * Selon `config.moment_calcul` :
 * - `etat_final` (défaut) : le loyer reflète l'état FINAL du panier (toutes les
 *   réponses), évalué ici à la génération / l'aperçu.
 * - `fige_popup` : on réutilise la valeur affichée dans le popup `resume_ref`
 *   pendant le questionnaire (réponse `sp_reference_figee`). Fallback sur
 *   `etat_final` si aucune valeur figée n'a été enregistrée.
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

  if (config.moment_calcul === 'fige_popup') {
    const figee = reponses.find((r) => r.question_id === 'sp_reference_figee')?.valeur;
    if (typeof figee === 'string' && figee.length > 0) return figee;
    // sinon : fallback sur le calcul état final ci-dessous
  }

  const partieVariable = config.partie_variable;
  let montant: number | null | undefined = undefined;
  if (partieVariable === 'loyer_avec_marge') {
    const cart = calculateCartSummary(reponses, questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts, spPreferencesProduits);
    montant = cart.totalMensuelFinal;
  } else if (partieVariable === 'loyer_sans_marge') {
    const cart = calculateCartSummary(
      reponses.filter((r) => r.question_id !== 'sp_marge_calculee'),
      questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts, spPreferencesProduits,
    );
    montant = cart.totalMensuelFinal;
  }

  return montant != null ? `${fixe}${Math.ceil(montant)}` : fixe;
}
