import { describe, expect, it } from 'vitest';
import type { CatalogueCategorie, CatalogueProduit, SuggestionsSpCompletes } from '@/types';
import { repairSpCompletesFromQuestionnaire } from './repairSpCompletes';

function product(
  id: string,
  nom: string,
  categorie: CatalogueCategorie,
  type_frequence: 'mensuel' | 'unique',
  prix: number,
  fournisseur?: string,
): CatalogueProduit {
  return {
    id,
    organization_id: 'org-1',
    categorie,
    nom,
    type_frequence,
    ...(type_frequence === 'mensuel' ? { prix_mensuel: prix } : { prix_vente: prix }),
    ...(fournisseur ? { fournisseur } : {}),
    caracteristiques: {},
    tags: [],
    est_produit_base: false,
    actif: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('repairSpCompletesFromQuestionnaire — édition directe et mode sans questions', () => {
  const mobile5Go = product('mob-5go', 'Forfait Mobile 5Go - Orange', 'mobile', 'mensuel', 14, 'Orange');
  const fixeLic = product('fixe-lic', 'Licence Centrex 24/7', 'fixe', 'mensuel', 14.9, 'Autre');
  const fibre = product('int-fibre', 'E-FIBRE FTTH DÉBIT JUSQU’À 1 GBPS', 'internet', 'mensuel', 60, 'Access Orange');
  const poste = product('mat-poste', 'Poste IP Yealink', 'equipement', 'unique', 120, 'Yealink');
  const cadeau = product('cad-tablette', 'Tablette Samsung', 'cadeau', 'unique', 250);
  const catalogue = [mobile5Go, fixeLic, fibre, poste, cadeau];

  it('fonctionne sans questions SP ni sp initial (produits ajoutés manuellement)', () => {
    const reponses = [
      { question_id: 'manual_1', valeur: mobile5Go.id },
      { question_id: 'quantite_manual_1', valeur: JSON.stringify({ [mobile5Go.nom]: '2' }) },
      { question_id: 'numero_manual_1', valeur: JSON.stringify({ [mobile5Go.id]: '06 12 34 56 78' }) },
      { question_id: 'fas_manual_1', valeur: JSON.stringify({ [mobile5Go.nom]: '49' }) },
      { question_id: 'manual_2', valeur: poste.id },
      { question_id: 'sp_total_indemnites', valeur: '500' },
      { question_id: 'sp_marge_calculee', valeur: '1000' },
    ];

    const repaired = repairSpCompletesFromQuestionnaire(
      null,
      reponses,
      [],
      catalogue,
      {
        client: {
          raison_sociale: 'SARL HENRIOT',
          nom: 'Henriot',
          prenom: 'Jean',
          adresse: '16 RUE DES COGNETS',
          code_postal: '25520',
          ville: 'BUGNY',
          email: 'contact@henriot.fr',
        },
        situation_actuelle: {
          abonnements: [{ libelle: 'Forfait Actuel', tarif_net_mensuel: 200 }],
        },
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        allowEmptyCart: true,
        clientOverrides: {
          sp_fournisseur_propose: 'Orange',
        },
      },
    );

    expect(repaired).not.toBeNull();
    expect(repaired?.sp_fournisseur_propose).toBe('Orange');
    expect(repaired?.sp_adresse_facturation?.societe).toBe('SARL HENRIOT');
    expect(repaired?.sp_lignes_mobiles).toHaveLength(1);
    expect(repaired?.sp_lignes_mobiles[0]).toMatchObject({
      sp_produit: mobile5Go.nom,
      sp_quantite: '2',
      sp_numero: '06 12 34 56 78',
      _prix_propose_raw: 28,
    });
    expect(repaired?.sp_bdc_operateur_numeros_table?.[0].sp_bdc_op_nom).toContain('06 12 34 56 78');
    expect(repaired?.sp_materiel).toHaveLength(1);
    expect(repaired?.sp_fas_total).toBeDefined();
    expect(repaired?.sp_total_indemnites).toBeDefined();
  });

  it('vide proprement une catégorie lorsque tous ses produits ont été supprimés', () => {
    const initialSp: SuggestionsSpCompletes = {
      suggestions: [],
      synthese: { cout_total_actuel: 0, cout_total_propose: 0, economie_mensuelle: 0, economie_annuelle: 0 },
      sp_lignes_mobiles: [{
        sp_nom_ligne: mobile5Go.nom,
        sp_produit: mobile5Go.nom,
        sp_prix_actuel: '0,00 €',
        sp_prix_propose: '14,00 €',
        sp_economie: '0,00 €',
        sp_analyse: '',
        sp_justification: '',
        sp_type_ligne: 'Mobile',
        _prix_actuel_raw: 0,
        _prix_propose_raw: 14,
        _economie_raw: 0,
      }],
      sp_lignes_fixes: [],
      sp_internet: [],
      sp_materiel: [],
      sp_cadeaux_table: [{
        sp_cadeau_nom: cadeau.nom,
        sp_cadeau_quantite: '1',
        sp_cadeau_valeur_ht: '250,00 €',
        _valeur_raw: 250,
      }],
      sp_economie_mensuelle: '',
      sp_economie_annuelle: '',
      sp_total_actuel: '0,00 €',
      sp_total_propose: '14,00 €',
      sp_ameliorations: '',
      sp_nb_lignes: '1',
      sp_est_economie: 'Non',
    };

    const repaired = repairSpCompletesFromQuestionnaire(
      initialSp,
      [],
      [],
      catalogue,
      {},
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { allowEmptyCart: true },
    );

    expect(repaired?.sp_lignes_mobiles).toEqual([]);
    expect(repaired?.sp_cadeaux_table).toEqual([]);
    expect(repaired?.sp_nb_lignes).toBe('0');
  });
});
