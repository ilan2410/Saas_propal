import { describe, expect, it } from 'vitest';
import type { CatalogueCategorie, CatalogueProduit, SpQuestion } from '@/types';
import { calculateCartSummary } from './calculateCart';
import { calculerBaseLoyer, calculerLoyer, DEFAULT_BAREME } from './calculLoyer';
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
