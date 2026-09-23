import type { CatalogueProduit, SpConfigRemises, SpQuestion, SpQuestionReponse, SpRegleRemise, SpPreferencesProduits } from '@/types';
import { evaluateQuestionVisibility, evaluateGroupes } from './evaluateConditions';

export function resolveRemiseProduit(
  product: CatalogueProduit,
  config?: SpConfigRemises,
): CatalogueProduit {
  const remise = config?.produits?.[product.id];
  if (config?.actif === false || remise?.mode === 'aucune') {
    return { ...product, remise_type: undefined, remise_valeur: undefined };
  }
  if (remise?.mode === 'personnalisee') {
    return {
      ...product,
      remise_type: remise.remise_type,
      remise_valeur: Number.isFinite(remise.remise_valeur) ? remise.remise_valeur : undefined,
    };
  }
  return product;
}

export function calculerPrixRemiseProduit(product: CatalogueProduit): number | null {
  if (product.prix_mensuel == null || product.remise_valeur == null) return null;
  if (product.remise_type === 'fixe') return Math.max(0, product.prix_mensuel - product.remise_valeur);
  if (product.remise_type === 'pourcentage') {
    return Math.max(0, product.prix_mensuel * (1 - product.remise_valeur / 100));
  }
  return null;
}

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

function addAutoProductNames(
  selectedNames: Set<string>,
  spPreferencesProduits: SpPreferencesProduits | undefined,
  products: CatalogueProduit[],
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
) {
  if (!spPreferencesProduits) return;

  // Produits fixes toujours ajoutés
  for (const produitId of spPreferencesProduits.produits_fixes_ids ?? []) {
    const p = products.find((prod) => prod.id === produitId);
    if (p && p.actif) selectedNames.add(p.nom.trim().toLowerCase());
  }

  // Règles conditionnelles d'ajout automatique
  for (const regle of spPreferencesProduits.regles_auto ?? []) {
    if (!regle.actif) continue;
    const condMet = evaluateGroupes(
      regle.groupes_conditions,
      regle.logique_declencheur,
      reponses,
      donneesExtraites,
      null,
      products,
    );
    if (!condMet) continue;
    for (const produitId of regle.produits_ids ?? []) {
      const p = products.find((prod) => prod.id === produitId);
      if (p && p.actif) selectedNames.add(p.nom.trim().toLowerCase());
    }
  }
}

export function getEligibleDiscountProducts(params: {
  rules: SpRegleRemise[];
  products: CatalogueProduit[];
  reponses: SpQuestionReponse[];
  donneesExtraites: Record<string, unknown>;
  spPreferencesProduits?: SpPreferencesProduits;
  spConfigRemises?: SpConfigRemises;
}): CatalogueProduit[] {
  const { rules, products, reponses, donneesExtraites, spPreferencesProduits, spConfigRemises } = params;
  if (spConfigRemises?.actif === false) return [];
  const selectedNames = selectedProductNamesFromResponses(reponses);
  addAutoProductNames(selectedNames, spPreferencesProduits, products, reponses, donneesExtraites);
  const activeRules = rules.filter((rule) => rule.actif);
  if (selectedNames.size === 0) return [];

  return products.map((product) => resolveRemiseProduit(product, spConfigRemises)).filter((product) => {
    if (!product.actif) return false;
    if (product.type_frequence !== 'mensuel') return false;
    if (product.remise_valeur == null || !Number.isFinite(product.remise_valeur)) return false;
    if (!selectedNames.has(product.nom.trim().toLowerCase())) return false;

    if (activeRules.length === 0) return true;
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
