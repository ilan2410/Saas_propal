import { describe, expect, it } from 'vitest';
import { withTableRowTotal, withTableTotalField, withTableTotals } from './table-row-total';
import { buildSpWordData } from './sp-word-data';
import { buildSaWordData } from './word-data-utils';
import type { SuggestionsSpCompletes } from '@/types';

describe('prix total des lignes de tableau', () => {
  it.each([
    { quantite: 3, tarif: '45,90 €' },
    { sp_sp_quantite: '3', sp_sp_prix_propose: '45,90 €' },
    { sp_matd_quantite: '3', sp_matd_prix_ht: '45,90 €' },
    { sp_bdc_op_quantite: '3', sp_bdc_op_prix_mensuel_ht: '45,90 €' },
    { sp_bdc_int_quantite: '3', sp_bdc_int_prix_mensuel_ht: '45,90 €' },
    { sp_bdc_mat_quantite: '3', sp_bdc_mat_prix_ht: '45,90 €' },
    { sp_cadeau_quantite: '3', sp_cadeau_valeur_ht: '45,90 €' },
    { sp_materiel_quantite: '3', sp_materiel_prix_mensuel: '45,90 €' },
  ])('ajoute seulement le total à %j', row => {
    const result = withTableRowTotal(row);
    expect(result.prix_total).toBe('137,70 €');
    const { prix_total: _total, ...original } = result;
    expect(_total).toBe('137,70 €');
    expect(original).toEqual(row);
    expect(row).not.toHaveProperty('prix_total');
  });
  it('respecte zéro, décimales, montants négatifs et milliers français', () => {
    expect(withTableRowTotal({ quantite: 0, tarif: 45.9 }).prix_total).toBe('0,00 €');
    expect(withTableRowTotal({ quantite: 2.5, prix: '1 200,10 €' }).prix_total).toBe('3\u202f000,25 €');
    expect(withTableRowTotal({ quantite: 3, prix: '-10,10 €' }).prix_total).toBe('-30,30 €');
    expect(withTableRowTotal({ quantite: 3, prix: 'inconnu' }).prix_total).toBe('');
    expect(withTableRowTotal({ prix: 42 })).not.toHaveProperty('prix_total');
    expect(withTableRowTotal({ quantite: 2, prix: 42, prix_total: 'existant' }).prix_total).toBe('existant');
  });
  it('enrichit les tableaux SA et SP pour Word sans changer les autres champs', () => {
    const sa = buildSaWordData({ lignes: [{ designation: 'Forfait', quantite: 3, tarif: 45.9 }] });
    expect((sa.lignes as Record<string, unknown>[])[0].prix_total).toBe('137,70 €');
    const row = { sp_matd_nom: 'Produit', sp_matd_quantite: '3', sp_matd_prix_ht: '45,90 €' };
    const sp = buildSpWordData({ sp_materiel_detail: [row] } as unknown as SuggestionsSpCompletes);
    expect((sp.sp_materiel_detail as Record<string, unknown>[])[0]).toEqual({ ...row, prix_total: '137,70 €' });
    expect(withTableTotals({ tableau: [row], valeur: 'inchangée' }).valeur).toBe('inchangée');
  });
  it('ajoute le champ disponible seulement aux définitions avec quantité et prix', () => {
    const definition = { rowFields: [{ id: 'quantite', label: 'Quantité', type: 'number' }, { id: 'tarif', label: 'Tarif', type: 'number' }] };
    expect(withTableTotalField(definition).rowFields.map(field => field.id)).toEqual(['quantite', 'tarif', 'prix_total']);
    expect(withTableTotalField(withTableTotalField(definition)).rowFields).toHaveLength(3);
    expect(withTableTotalField({ rowFields: definition.rowFields.slice(1) }).rowFields).toHaveLength(1);
  });
});
