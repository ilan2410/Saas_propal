import { useMemo } from 'react';
import { Suggestion, SuggestionsSynthese, SuggestionsGenerees, ModificationState } from '@/types';

interface UseSuggestionsTrackerProps {
  originalData: SuggestionsGenerees;
  currentSuggestions: Suggestion[];
  currentSynthese: SuggestionsSynthese;
}

export function useSuggestionsTracker({
  originalData,
  currentSuggestions,
  currentSynthese,
}: UseSuggestionsTrackerProps) {
  
  const state: ModificationState = useMemo(() => {
    let changedProductsCount = 0;
    let hasAnalysisUpdates = false;
    let hasSynthesisUpdate = false;

    // Comparaison des suggestions (produits et analyses)
    currentSuggestions.forEach((currentSuggestion, index) => {
      const originalSuggestion = originalData.suggestions[index];
      
      if (!originalSuggestion) return;

      // Détection changement produit
      const isProductChanged = 
        currentSuggestion.produit_propose_id !== originalSuggestion.produit_propose_id ||
        currentSuggestion.produit_propose_nom !== originalSuggestion.produit_propose_nom;

      if (isProductChanged) {
        changedProductsCount++;
      }

      // Détection changement analyse (si différente de l'originale)
      const isAnalysisChanged = currentSuggestion.justification !== originalSuggestion.justification;
      if (isAnalysisChanged) {
        hasAnalysisUpdates = true;
      }
    });

    // Comparaison synthèse
    // On compare le contenu des améliorations
    const originalAmeliorations = originalData.synthese.ameliorations || [];
    const currentAmeliorations = currentSynthese.ameliorations || [];
    
    // Si la longueur est différente ou si un élément est différent
    if (originalAmeliorations.length !== currentAmeliorations.length) {
      hasSynthesisUpdate = true;
    } else {
      const isSynthesisChanged = currentAmeliorations.some((item, index) => item !== originalAmeliorations[index]);
      if (isSynthesisChanged) {
        hasSynthesisUpdate = true;
      }
    }

    return {
      hasProductChanges: changedProductsCount > 0,
      hasAnalysisUpdates,
      hasSynthesisUpdate,
      changedProductsCount
    };
  }, [originalData, currentSuggestions, currentSynthese]);

  // Fonction pour déterminer si un avertissement est nécessaire
  const needsWarning = () => {
    // Si des produits ont changé
    if (state.hasProductChanges) {
      // On vérifie si les textes ont été mis à jour
      // C'est une heuristique : si on a changé des produits mais qu'on a pas touché aux analyses ni à la synthèse
      // alors il y a un risque d'incohérence.
      // Idéalement, on voudrait savoir si l'analyse SPÉCIFIQUE du produit changé a été mise à jour.
      
      // Pour simplifier selon le prompt : "alerter si des modifications de produits n'ont pas été suivies d'une mise à jour des textes"
      // Donc si product changes > 0 ET (pas d'update analyse ET pas d'update synthèse) -> Warning
      
      // Mais attention, l'utilisateur peut avoir changé un produit et mis à jour SON analyse.
      // Si hasAnalysisUpdates est true, ça veut dire qu'au moins une analyse a changé.
      
      // Le prompt dit : "Vérifier si les justification ont été modifiées après changement de produit"
      // C'est difficile à dire "après" sans historique temporel ici, on compare juste des états.
      // On va supposer que si le texte est différent de l'original, c'est qu'il a été mis à jour (manuellement ou régénéré).
      
      // Si on a changé des produits, on s'attend à ce que les analyses soient aussi changées (pour ces produits).
      // On va itérer pour être plus précis.
      
      const unsynchronizedChanges = currentSuggestions.some((currentSuggestion, index) => {
        const originalSuggestion = originalData.suggestions[index];
        if (!originalSuggestion) return false;

        const isProductChanged = 
          currentSuggestion.produit_propose_id !== originalSuggestion.produit_propose_id ||
          currentSuggestion.produit_propose_nom !== originalSuggestion.produit_propose_nom;

        const isAnalysisChanged = currentSuggestion.justification !== originalSuggestion.justification;

        // Si le produit a changé MAIS l'analyse est restée identique à l'originale -> Problème
        return isProductChanged && !isAnalysisChanged;
      });

      if (unsynchronizedChanges) return true;
      
      // On vérifie aussi la synthèse. Si des produits changent, la synthèse devrait idéalement changer.
      // Mais c'est peut-être moins critique que l'analyse produit par produit.
      // Le prompt dit : "Garde-fou avant téléchargement PDF : alerter si des modifications de produits n'ont pas été suivies d'une mise à jour des textes"
      
      // Si on a des produits changés non synchronisés, on retourne true.
    }
    
    return false;
  };

  return {
    modificationState: state,
    needsWarning
  };
}
