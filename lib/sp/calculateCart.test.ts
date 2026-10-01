import { describe, expect, it } from 'vitest';
import type { CatalogueCategorie, CatalogueProduit, SpQuestion, SuggestionsSpCompletes } from '@/types';
import { calculateCartSummary } from './calculateCart';
import { buildSolutionProposeeLines } from './buildExportSaSpData';
import { orderProductsByPreference } from './productTableOrder';
import { repairSpCompletesFromQuestionnaire } from './repairSpCompletes';
import { calculerBaseLoyer, calculerLoyer, resolveTotalMensuelFinal, DEFAULT_BAREME } from './calculLoyer';
import { calculerPrixRemiseProduit, getEligibleDiscountProducts, resolveRemiseProduit } from './evaluateDiscountRules';

function product(
  id: string,
  nom: string,
  categorie: CatalogueCategorie,
  type_frequence: 'mensuel' | 'unique',
  prix: number,
): CatalogueProduit {
  return {
    id,
    organization_id: 'org-1',
    categorie,
    nom,
    type_frequence,
    ...(type_frequence === 'mensuel' ? { prix_mensuel: prix } : { prix_vente: prix }),
    caracteristiques: {},
    tags: [],
    est_produit_base: false,
    actif: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function question(id: string): SpQuestion {
  return {
    id,
    template_id: 'template-1',
    ordre: 1,
    actif: true,
    libelle: id,
    source: 'catalogue',
    affichage: 'boutons_choix_unique',
    obligatoire: false,
    consequences: [],
    priorite_ia: 'normale',
  };
}

describe('calculateCartSummary — quantités des options', () => {
  const parent = product('fibre', 'Fibre', 'internet', 'mensuel', 50);
  const option = product('gtr', 'GTR', 'internet', 'mensuel', 10);
  const materiel = product('routeur', 'Routeur', 'equipement', 'unique', 25);
  materiel.mode_fas = 'multiplie_par_quantite';
  materiel.prix_installation = 5;
  const catalogue = [parent, option, materiel];
  const questions = [question('offre')];

  it('conserve les anciennes réponses et isole les quantités des produits parents', () => {
    const summary = calculateCartSummary([
      { question_id: 'offre', valeur: parent.nom },
      { question_id: 'quantite_offre', valeur: '3' },
      { question_id: 'options_offre', valeur: JSON.stringify([option.id]) },
    ], questions, catalogue);

    expect(summary.lines.map(({ produitId, quantite, prixTotal }) => ({ produitId, quantite, prixTotal }))).toEqual([
      { produitId: parent.id, quantite: 3, prixTotal: 150 },
      { produitId: option.id, quantite: 1, prixTotal: 10 },
    ]);
  });

  it('calcule chaque option avec sa quantité, ses FAS et le comparatif SA/SP', () => {
    const summary = calculateCartSummary([
      { question_id: 'offre', valeur: [parent.nom] },
      { question_id: 'quantite_offre', valeur: JSON.stringify({ [parent.nom]: '2' }) },
      { question_id: 'options_offre', valeur: JSON.stringify([option.id, materiel.id]) },
      { question_id: 'quantite_options_offre', valeur: JSON.stringify({ [option.id]: '4', [materiel.id]: '3' }) },
    ], questions, catalogue);

    expect(summary.lines.map(({ produitId, quantite, prixTotal, fasTotal }) => ({ produitId, quantite, prixTotal, fasTotal }))).toEqual([
      { produitId: parent.id, quantite: 2, prixTotal: 100, fasTotal: 0 },
      { produitId: option.id, quantite: 4, prixTotal: 40, fasTotal: 0 },
      { produitId: materiel.id, quantite: 3, prixTotal: 75, fasTotal: 15 },
    ]);
    expect(summary.abonnements.totalMensuel).toBe(140);
    expect(summary.materiel).toBe(75);
    expect(summary.fas).toBe(15);
    expect(buildSolutionProposeeLines(summary, catalogue).lines.map(({ offre, quantite }) => ({ offre, quantite }))).toEqual([
      { offre: parent.nom, quantite: 2 },
      { offre: option.nom, quantite: 4 },
    ]);
    expect(orderProductsByPreference(summary.lines, [option.id, parent.id, materiel.id], (line) => line.produitId)
      .map((line) => line.produitId)).toEqual([option.id, parent.id, materiel.id]);
  });

  it('reporte la quantité des options dans les variables tableaux et respecte leur ordre configuré', () => {
    const reponses = [
      { question_id: 'offre', valeur: parent.nom },
      { question_id: 'options_offre', valeur: JSON.stringify([materiel.id]) },
      { question_id: 'quantite_options_offre', valeur: JSON.stringify({ [materiel.id]: '3' }) },
    ];
    const repaired = repairSpCompletesFromQuestionnaire(
      {} as SuggestionsSpCompletes, reponses, questions, catalogue, {},
      undefined, undefined, undefined, undefined,
      { sp_situation_proposee_complet: [materiel.id, parent.id], sp_bdc_materiel_table: [materiel.id] },
    );
    expect(repaired?.sp_materiel_detail?.[0]).toMatchObject({ sp_matd_nom: materiel.nom, sp_matd_quantite: '3' });
    expect(repaired?.sp_bdc_materiel_table?.[0]).toMatchObject({ sp_bdc_mat_nom: materiel.nom, sp_bdc_mat_quantite: '3' });
    expect(repaired?.sp_situation_proposee_complet?.map(({ sp_sp_produit, sp_sp_quantite }) => ({ sp_sp_produit, sp_sp_quantite })))
      .toEqual([{ sp_sp_produit: materiel.nom, sp_sp_quantite: '3' }, { sp_sp_produit: parent.nom, sp_sp_quantite: '1' }]);
  });

  it('privilégie la quantité modifiée dans le panier et applique les tranches de prix des options', () => {
    const optionAvecTranches: CatalogueProduit = { ...option, prix_par_tranche: [{ id: 'tier-1', qte_min: 2, qte_max: null, prix_mensuel: 8 }] };
    const summary = calculateCartSummary([
      { question_id: 'offre', valeur: parent.nom },
      { question_id: 'options_offre', valeur: JSON.stringify([option.id]) },
      { question_id: 'quantite_options_offre', valeur: JSON.stringify({ [option.id]: '2', [option.nom]: '4' }) },
    ], questions, [parent, optionAvecTranches]);
    expect(summary.lines[1]).toMatchObject({ produitId: option.id, quantite: 4, prixTotal: 32 });
  });

  it('ignore les quantités invalides et les options non sélectionnées', () => {
    const summary = calculateCartSummary([
      { question_id: 'offre', valeur: parent.nom },
      { question_id: 'options_offre', valeur: JSON.stringify([option.id]) },
      { question_id: 'quantite_options_offre', valeur: JSON.stringify({ [option.id]: '-2', [materiel.id]: '8' }) },
    ], questions, catalogue);
    expect(summary.lines.map(({ produitId, quantite }) => ({ produitId, quantite }))).toEqual([
      { produitId: parent.id, quantite: 1 },
      { produitId: option.id, quantite: 1 },
    ]);
  });
});

describe('calculateCartSummary — mois offerts', () => {
  it('multiplie le total des abonnements mensuels par le nombre de mois offerts', () => {
    const catalogue = [
      product('mensuel', 'Abonnements', 'fixe', 'mensuel', 162.4),
      product('ponctuel', 'Éléments ponctuels', 'equipement', 'unique', 2835),
    ];
    const questions = catalogue.map(({ id }) => question(id));
    const reponses = [
      ...catalogue.map(({ id, nom }) => ({ question_id: id, valeur: nom })),
      { question_id: 'sp_total_indemnites', valeur: '3000' },
      { question_id: 'sp_marge_calculee', valeur: '1500' },
    ];

    const summary = calculateCartSummary(
      reponses,
      questions,
      catalogue,
      {},
      {
        baremes: [{
          id: 'default',
          nom: 'Défaut',
          ordre: 0,
          taux_durees: [{ duree_mois: 63, taux_loyer: 0.063, mois_offerts: 18, trimestres: 21 }],
        }],
        duree_mois_par_defaut: 63,
      },
    );

    expect(summary.abonnements.totalMensuel).toBe(162.4);
    expect(summary.loyer?.loyer_mensuel).toBe(216);
    expect(summary.remiseMoisOffert).toBeCloseTo(2923.2);
    expect(summary.baseLoyer).toBeCloseTo(10258.2);
  });

  it('exclut les mois offerts du financement sans effacer leur montant', () => {
    const catalogue = [
      product('mensuel', 'Abonnements', 'fixe', 'mensuel', 100),
      product('ponctuel', 'Matériel', 'equipement', 'unique', 1000),
    ];
    const summary = calculateCartSummary(
      catalogue.map(({ id, nom }) => ({ question_id: id, valeur: nom })),
      catalogue.map(({ id }) => question(id)),
      catalogue,
      {},
      {
        baremes: [{
          id: 'default',
          nom: 'Défaut',
          ordre: 0,
          taux_durees: [{ duree_mois: 63, taux_loyer: 0.063, mois_offerts: 18, trimestres: 21 }],
        }],
        duree_mois_par_defaut: 63,
        mois_offerts_actifs: false,
      },
    );

    expect(summary.remiseMoisOffert).toBe(1800);
    expect(summary.baseLoyer).toBe(1000);
    expect(summary.loyer?.loyer_mensuel).toBe(21);
  });
});

describe('resolveTotalMensuelFinal', () => {
  it('mode tout_compris (défaut) : renvoie le loyer quand il existe', () => {
    expect(resolveTotalMensuelFinal(70, 24)).toBe(24);
  });

  it('mode tout_compris : renvoie les abonnements en repli quand il n’y a pas de loyer', () => {
    expect(resolveTotalMensuelFinal(70, null, 'tout_compris')).toBe(70);
    expect(resolveTotalMensuelFinal(70, undefined, 'tout_compris')).toBe(70);
  });

  it('mode separe : additionne abonnements et loyer', () => {
    expect(resolveTotalMensuelFinal(70, 24, 'separe')).toBe(94);
  });

  it('mode separe : revient aux abonnements seuls quand il n’y a pas de loyer', () => {
    expect(resolveTotalMensuelFinal(70, null, 'separe')).toBe(70);
  });
});

describe('calculateCartSummary — totalMensuelFinal', () => {
  const catalogue = [
    product('mensuel', 'Abonnements', 'fixe', 'mensuel', 70),
    product('ponctuel', 'Matériel', 'equipement', 'unique', 1000),
  ];
  const questions = catalogue.map(({ id }) => question(id));
  const reponses = catalogue.map(({ id, nom }) => ({ question_id: id, valeur: nom }));
  const baseConfig = {
    baremes: [{
      id: 'default',
      nom: 'Défaut',
      ordre: 0,
      taux_durees: [{ duree_mois: 63, taux_loyer: 0.063, mois_offerts: 18, trimestres: 21 }],
    }],
    duree_mois_par_defaut: 63,
    mois_offerts_actifs: false,
  };

  it('mode tout_compris (défaut) : le total final ignore les abonnements quand un loyer existe', () => {
    const summary = calculateCartSummary(reponses, questions, catalogue, {}, baseConfig);
    expect(summary.abonnements.totalMensuel).toBe(70);
    expect(summary.loyer?.loyer_mensuel).toBe(21);
    expect(summary.totalMensuelFinal).toBe(21);
  });

  it('mode separe : le total final additionne abonnements et loyer', () => {
    const summary = calculateCartSummary(reponses, questions, catalogue, {}, {
      ...baseConfig,
      mode_total_mensuel: 'separe',
    });
    expect(summary.totalMensuelFinal).toBe(91);
  });
});

describe('calculateCartSummary — code promo ciblant les abonnements', () => {
  const catalogue = [
    product('mensuel', 'Abonnements', 'fixe', 'mensuel', 70),
    product('ponctuel', 'Matériel', 'equipement', 'unique', 1000),
  ];
  const questions = catalogue.map(({ id }) => question(id));
  const baseReponses = catalogue.map(({ id, nom }) => ({ question_id: id, valeur: nom }));
  const config = {
    baremes: [{
      id: 'default',
      nom: 'Défaut',
      ordre: 0,
      taux_durees: [{ duree_mois: 63, taux_loyer: 0.063, mois_offerts: 18, trimestres: 21 }],
    }],
    duree_mois_par_defaut: 63,
    mois_offerts_actifs: false,
    mode_total_mensuel: 'separe' as const,
  };

  it('applique la remise directement sur le total des abonnements, sans toucher la marge/le loyer', () => {
    const reponses = [
      ...baseReponses,
      { question_id: 'sp_remise_abonnements_promo', valeur: '-20' },
    ];
    const summary = calculateCartSummary(reponses, questions, catalogue, {}, config);
    expect(summary.abonnements.totalMensuel).toBe(50);
    expect(summary.loyer?.loyer_mensuel).toBe(21);
    expect(summary.totalMensuelFinal).toBe(71);
  });

  it('expose le détail du code promo avec sa cible', () => {
    const reponses = [
      ...baseReponses,
      { question_id: 'sp_remise_abonnements_promo', valeur: '-20' },
      { question_id: 'sp_code_promo_nom', valeur: 'BIENVENUE20' },
      { question_id: 'sp_code_promo_valeur', valeur: '20' },
      { question_id: 'sp_code_promo_mode', valeur: 'soustraction' },
      { question_id: 'sp_code_promo_cible', valeur: 'abonnements' },
      { question_id: 'sp_abonnements_avant_promo', valeur: '70' },
    ];
    const summary = calculateCartSummary(reponses, questions, catalogue, {}, config);
    expect(summary.codePromo).toEqual({
      nom: 'BIENVENUE20',
      valeur: 20,
      mode: 'soustraction',
      cible: 'abonnements',
      margeAvant: 0,
      abonnementsAvant: 70,
    });
  });
});

describe('configuration de la formule du loyer', () => {
  it('applique le diviseur et l’arrondi configurés', () => {
    const result = calculerLoyer(DEFAULT_BAREME, 1000, 63, undefined, {
      diviseur: 2,
      arrondi: 'standard',
      decimales: 2,
    });

    expect(result?.loyer_mensuel).toBe(31.5);
  });

  it('permet d’exclure chaque composante séparément', () => {
    const base = calculerBaseLoyer({
      materiel: 100,
      cadeaux: 200,
      installations: 300,
      fas: 400,
      autres_ponctuels: 500,
      mois_offerts: 600,
      indemnites: 700,
      marge: 800,
    }, {
      baremes: [DEFAULT_BAREME],
      composantes_base: {
        materiel: true,
        cadeaux: false,
        installations: true,
        fas: false,
        autres_ponctuels: true,
        mois_offerts: false,
        indemnites: true,
        marge: false,
      },
    });

    expect(base).toBe(1600);
  });
});

describe('remises produits par template', () => {
  const produit = product('mobile', 'Forfait mobile', 'mobile', 'mensuel', 30);
  produit.remise_type = 'pourcentage';
  produit.remise_valeur = 10;

  it('utilise la remise catalogue sans surcharge', () => {
    expect(calculerPrixRemiseProduit(resolveRemiseProduit(produit))).toBe(27);
  });

  it('priorise la remise personnalisée du template', () => {
    const resolved = resolveRemiseProduit(produit, {
      actif: true,
      regles: [],
      produits: {
        [produit.id]: { mode: 'personnalisee', remise_type: 'pourcentage', remise_valeur: 20 },
      },
    });

    expect(calculerPrixRemiseProduit(resolved)).toBe(24);
  });

  it('permet de désactiver la remise pour un produit du template', () => {
    const resolved = resolveRemiseProduit(produit, {
      actif: true,
      regles: [],
      produits: { [produit.id]: { mode: 'aucune' } },
    });

    expect(calculerPrixRemiseProduit(resolved)).toBeNull();
  });

  it('applique les remises sans condition quand aucune règle n’est configurée', () => {
    const eligibles = getEligibleDiscountProducts({
      rules: [],
      products: [produit],
      reponses: [{ question_id: 'produit', valeur: produit.nom }],
      donneesExtraites: {},
      spConfigRemises: { actif: true, produits: {}, regles: [] },
    });

    expect(eligibles).toHaveLength(1);
    expect(eligibles[0]?.id).toBe(produit.id);
  });

  it('applique les remises sans condition quand toutes les règles sont inactives', () => {
    const eligibles = getEligibleDiscountProducts({
      rules: [{
        id: 'inactive',
        nom: 'Règle inactive',
        actif: false,
        groupes_conditions: [],
      }],
      products: [produit],
      reponses: [{ question_id: 'produit', valeur: produit.nom }],
      donneesExtraites: {},
      spConfigRemises: { actif: true, produits: {}, regles: [] },
    });

    expect(eligibles).toHaveLength(1);
    expect(eligibles[0]?.id).toBe(produit.id);
  });
});
