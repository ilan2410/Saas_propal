import { describe, expect, it } from 'vitest';
import type { CatalogueProduit, SpQuestion, SpQuestionReponse } from '@/types';
import { calculateCartSummary } from './calculateCart';
import { updateCartLinePriceOrQuantity } from './cartLineEdits';

const abonnement: CatalogueProduit = {
  id: 'fax',
  organization_id: 'org-1',
  nom: 'Fax par mail',
  categorie: 'fixe',
  type_frequence: 'mensuel',
  prix_mensuel: 10,
  caracteristiques: {},
  tags: [],
  est_produit_base: false,
  actif: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};
const questions: SpQuestion[] = [
  {
    id: 'offre',
    template_id: 'template-1',
    ordre: 1,
    actif: true,
    libelle: 'Offre',
    source: 'catalogue',
    affichage: 'boutons_choix_unique',
    obligatoire: false,
    consequences: [],
    priorite_ia: 'normale',
  },
  {
    id: 'remise',
    template_id: 'template-1',
    ordre: 2,
    actif: true,
    libelle: 'Remise opérateur',
    source: 'catalogue',
    affichage: 'remise_produits',
    obligatoire: false,
    consequences: [],
    priorite_ia: 'normale',
  },
];

function summary(reponses: SpQuestionReponse[]) {
  return calculateCartSummary(reponses, questions, [abonnement]);
}

describe('édition des abonnements du panier SP', () => {
  const discounted: SpQuestionReponse[] = [
    { question_id: 'offre', valeur: abonnement.nom },
    { question_id: 'prix_offre', valeur: JSON.stringify({ [abonnement.nom]: '10' }) },
    { question_id: 'remise', valeur: true },
    { question_id: 'prix_remise', valeur: JSON.stringify({ [abonnement.id]: '5' }) },
  ];

  it('conserve le prix barré et le prix remisé quand la quantité change', () => {
    const before = summary(discounted);
    expect(before.lines[0]).toMatchObject({ quantite: 1, prixTotal: 5, prixOriginalTotal: 10 });

    const updated = updateCartLinePriceOrQuantity(discounted, before.lines[0], 'quantite', 3);
    expect(summary(updated).lines[0]).toMatchObject({
      quantite: 3,
      prixTotal: 15,
      prixOriginalTotal: 30,
    });
    expect(summary(updated).abonnements.totalMensuel).toBe(15);
    expect(JSON.parse(String(updated.find((r) => r.question_id === 'prix_offre')?.valeur))[abonnement.id]).toBe('30');
  });

  it('recalcule aussi la remise lorsque le produit n’a pas de prix saisi au questionnaire', () => {
    const withoutBaseOverride = discounted.filter((r) => r.question_id !== 'prix_offre');
    const updated = updateCartLinePriceOrQuantity(
      withoutBaseOverride, summary(withoutBaseOverride).lines[0], 'quantite', 2,
    );
    expect(summary(updated).lines[0]).toMatchObject({ quantite: 2, prixTotal: 10, prixOriginalTotal: 20 });
    expect(updated.some((r) => r.question_id === 'prix_offre')).toBe(false);
  });

  it('permet de changer le tarif remisé sans modifier la remise opérateur', () => {
    const before = summary(discounted);
    const edited = updateCartLinePriceOrQuantity(discounted, before.lines[0], 'prix', 4);
    expect(summary(edited).lines[0]).toMatchObject({ prixTotal: 4, prixOriginalTotal: 10 });
    expect(edited.find((r) => r.question_id === 'prix_remise')?.valeur)
      .toBe(discounted.find((r) => r.question_id === 'prix_remise')?.valeur);

    const multiplied = updateCartLinePriceOrQuantity(edited, summary(edited).lines[0], 'quantite', 2);
    expect(summary(multiplied).lines[0]).toMatchObject({ quantite: 2, prixTotal: 8, prixOriginalTotal: 20 });
  });

  it('conserve un tarif manuel même si la remise est retirée ensuite', () => {
    const edited = updateCartLinePriceOrQuantity(discounted, summary(discounted).lines[0], 'prix', 12);
    expect(summary(edited).lines[0]).toMatchObject({ prixTotal: 12 });
    expect(summary(edited).lines[0].prixOriginalTotal).toBeUndefined();

    const multiplied = updateCartLinePriceOrQuantity(edited, summary(edited).lines[0], 'quantite', 2);
    expect(summary(multiplied).lines[0]).toMatchObject({ quantite: 2, prixTotal: 24 });
    expect(summary(multiplied).lines[0].prixOriginalTotal).toBeUndefined();
  });

  it('garde le tarif manuel des abonnements sans remise quand la quantité change', () => {
    const withoutDiscount = discounted.filter((r) => r.question_id !== 'prix_remise');
    const edited = updateCartLinePriceOrQuantity(withoutDiscount, summary(withoutDiscount).lines[0], 'prix', 7);
    const multiplied = updateCartLinePriceOrQuantity(edited, summary(edited).lines[0], 'quantite', 3);
    expect(summary(multiplied).lines[0]).toMatchObject({ quantite: 3, prixTotal: 21 });
  });
});
