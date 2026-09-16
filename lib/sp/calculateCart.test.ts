import { describe, expect, it } from 'vitest';
import type { CatalogueCategorie, CatalogueProduit, SpQuestion } from '@/types';
import { calculateCartSummary } from './calculateCart';

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
});
