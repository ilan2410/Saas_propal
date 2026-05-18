import type { CatalogueProduit, SpQuestion, SpQuestionReponse, SpRegleRemise } from '@/types';
import { evaluateQuestionVisibility } from './evaluateConditions';

function selectedProductNamesFromResponses(reponses: SpQuestionReponse[]): Set<string> {
  const names = new Set<string>();
  for (const reponse of reponses) {
    if (reponse.question_id.startsWith('prix_')) continue;
    if (reponse.question_id.startsWith('fas_')) continue;
    if (reponse.question_id.startsWith('quantite_')) continue;
    const value = reponse.valeur;
    if (typeof value === 'string' && value.trim()) names.add(value.trim().toLowerCase());
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) names.add(item.trim().toLowerCase());
      }
    }
  }
  return names;
}

function ruleTargetsProduct(rule: SpRegleRemise, product: CatalogueProduit): boolean {
  if (rule.produits_ids?.length && !rule.produits_ids.includes(product.id) && !rule.produits_ids.includes(product.nom)) return false;
  if (rule.categories?.length && !rule.categories.includes(product.categorie)) return false;
  if (rule.fournisseurs?.length && (!product.fournisseur || !rule.fournisseurs.includes(product.fournisseur))) return false;
  return true;
}

export function getEligibleDiscountProducts(params: {
  rules: SpRegleRemise[];
  products: CatalogueProduit[];
  reponses: SpQuestionReponse[];
  donneesExtraites: Record<string, unknown>;
}): CatalogueProduit[] {
  const { rules, products, reponses, donneesExtraites } = params;
  const selectedNames = selectedProductNamesFromResponses(reponses);
  const activeRules = rules.filter((rule) => rule.actif);
  if (activeRules.length === 0 || selectedNames.size === 0) return [];

  return products.filter((product) => {
    if (!product.actif) return false;
    if (product.type_frequence !== 'mensuel') return false;
    if (product.remise_valeur == null || !Number.isFinite(product.remise_valeur)) return false;
    if (!selectedNames.has(product.nom.trim().toLowerCase())) return false;

    return activeRules.some((rule) => {
      if (!ruleTargetsProduct(rule, product)) return false;
      const fakeQuestion: SpQuestion = {
        id: `discount_${rule.id}`,
        template_id: '',
        ordre: 0,
        actif: true,
        libelle: rule.nom,
        source: 'aucune',
        groupes_conditions: rule.groupes_conditions,
        logique_declencheur: rule.logique_declencheur ?? 'ET',
        affichage: 'oui_non',
        obligatoire: false,
        consequences: [],
        priorite_ia: 'normale',
      };
      return evaluateQuestionVisibility(fakeQuestion, reponses, donneesExtraites, products);
    });
  });
}
