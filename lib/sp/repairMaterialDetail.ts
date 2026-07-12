import { calculateCartSummary } from '@/lib/sp/calculateCart';
import type {
  CatalogueProduit,
  SpMateriel,
  SpMaterielDetail,
  SpCadeauLigne,
  SpQuestion,
  SpQuestionReponse,
  SuggestionsSpCompletes,
  SpPreferencesProduits,
} from '@/types';

type UnknownRecord = Record<string, unknown>;

function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

/**
 * Reconstruit le détail matériel / cadeaux / indemnités d'une SP à partir des réponses
 * au questionnaire (catalogue + panier calculé). Fonction pure, partagée entre la route
 * de génération et la route d'aperçu pour garantir un rendu identique.
 */
export function repairMaterialDetailFromQuestionnaire(
  sp: SuggestionsSpCompletes | null,
  reponses: SpQuestionReponse[],
  questions: SpQuestion[],
  catalogue: CatalogueProduit[],
  donneesExtraites: UnknownRecord,
  spPreferencesProduits?: SpPreferencesProduits,
): SuggestionsSpCompletes | null {
  if (!sp || reponses.length === 0 || questions.length === 0 || catalogue.length === 0) return sp;

  const cart = calculateCartSummary(reponses, questions, catalogue, donneesExtraites, undefined, undefined, spPreferencesProduits);
  const catalogueMap = new Map<string, CatalogueProduit>();
  for (const item of catalogue) catalogueMap.set(item.id, item);
  const materielCartLines = cart.lines.filter((line) =>
    !['mobile', 'fixe', 'internet', 'cadeau'].includes(line.categorie)
  );
  const cadeauCartLines = cart.lines.filter((line) => line.categorie === 'cadeau');

  const hasMaterial = materielCartLines.length > 0;
  const hasCadeaux = cadeauCartLines.length > 0;
  const hasIndemnites = cart.indemnites > 0;
  if (!hasMaterial && !hasCadeaux && !hasIndemnites) return sp;

  const sp_materiel: SpMateriel[] = hasMaterial ? materielCartLines.map((line) => {
    const cat = line.produitId ? catalogueMap.get(line.produitId) : undefined;
    return {
      sp_materiel_nom: line.produitNom,
      sp_materiel_ref: undefined,
      sp_materiel_fournisseur: cat?.fournisseur,
      sp_materiel_prix_mensuel: formatEuro(line.prixTotal),
      sp_materiel_duree_engagement: '',
      sp_materiel_commentaire: '',
      sp_materiel_produit_id: line.produitId,
      sp_type_ligne: 'Materiel',
      _prix_mensuel_raw: line.prixTotal,
    };
  }) : [];

  const sp_materiel_detail: SpMaterielDetail[] = hasMaterial ? materielCartLines.map((line) => {
    const isLibre = !line.produitId;
    const cat = !isLibre && line.produitId ? catalogueMap.get(line.produitId) : undefined;
    const freq = isLibre ? 'unique' : (cat?.type_frequence ?? 'mensuel');
    const imageUrl = !isLibre && typeof cat?.image_url === 'string' ? cat.image_url : undefined;
    const description = !isLibre && typeof cat?.description === 'string' ? cat.description : '';
    return {
      sp_matd_nom: line.produitNom,
      sp_matd_ref: undefined,
      sp_matd_fournisseur: cat?.fournisseur,
      sp_matd_quantite: String(line.quantite ?? 1),
      sp_matd_prix_ht: formatEuro(line.prixTotal),
      sp_matd_description: description,
      sp_matd_frequence: freq === 'unique' ? 'Achat unique' : 'Mensuel',
      sp_matd_image_url: imageUrl,
      sp_mat_image_url: imageUrl,
      _prix_raw: line.prixTotal,
    };
  }) : [];

  const sp_cadeaux_table: SpCadeauLigne[] = hasCadeaux ? cadeauCartLines.map((line) => {
    return {
      sp_cadeau_nom: line.produitNom,
      sp_cadeau_ref: undefined,
      sp_cadeau_quantite: String(line.quantite ?? 1),
      sp_cadeau_valeur_ht: formatEuro(line.prixTotal),
      _valeur_raw: line.prixTotal,
      _libre: !line.produitId,
    };
  }) : [];

  const totalMateriel = hasMaterial ? sp_materiel.reduce((sum, item) => sum + item._prix_mensuel_raw, 0) : 0;
  const totalCadeaux = hasCadeaux ? sp_cadeaux_table.reduce((sum, item) => sum + item._valeur_raw, 0) : 0;

  const result: SuggestionsSpCompletes = { ...sp };
  if (hasMaterial) {
    result.sp_materiel = sp_materiel;
    result.sp_materiel_detail = sp_materiel_detail;
    result.sp_total_materiel_ht = formatEuro(totalMateriel);
  }
  if (hasCadeaux) {
    result.sp_cadeaux_table = sp_cadeaux_table;
    result.sp_total_cadeaux_ht = formatEuro(totalCadeaux);
  }
  if (hasIndemnites) {
    result.sp_total_indemnites = formatEuro(cart.indemnites);
  }
  return result;
}
