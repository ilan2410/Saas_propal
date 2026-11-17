import { describe, expect, it } from 'vitest';
import { buildEditedSaData, isSaConfirmed, requiresSaConfirmation, SaOperationsSchema } from './direct-confirmation';
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';
import { buildSaWordData } from '@/lib/generators/word-data-utils';
import { getSaEditableLines, prepareSaForEditing } from '@/lib/sp/saCartEdit';

const base = () => ({
  client: { raison_sociale: 'Client' }, resume: 'Ancien montant : 105 €',
  _sa_confirmation_required: true,
  'situation_actuelle.total_loyer_mensuel': 105,
  situation_actuelle: {
    abonnements: [{ libelle: 'Fibre', tarif_net_mensuel: 100, quantite: 1 }],
    locations: [{ libelle: 'Routeur', loyer_net_mensuel: 5, quantite: 1 }],
    total_ht_mensuel_client: 105, total_loyer_mensuel: 105,
    totaux: { total_abonnements_source: 100, total_locations_source: 5, total_solution_actuelle_source: 105 },
  },
});

describe('direct SA confirmation', () => {
  it('recalculates the preview, export aliases and Word rows after price and quantity edits', () => {
    const original = base();
    const result = buildEditedSaData(original, [
      { kind: 'update', id: 'abonnements:0', patch: { montant: 40, quantite: 2 } },
    ]);
    expect(calculateSaCartSummary(result).totalMensuel).toBe(85);
    expect(result['situation_actuelle.total_loyer_mensuel']).toBe(85);
    expect(result._extraction_control).toMatchObject({ total_ht_mensuel_client: 85 });
    expect(result.situation_actuelle).toMatchObject({ total_ht_mensuel_client: 85, total_abonnements: 80, total_materiel: 5 });
    expect(JSON.stringify(buildSaWordData(result))).toContain('40');
    expect(result.resume).toContain('85.00');
    expect(result.resume).not.toContain('105 €');
    expect(original.situation_actuelle.abonnements[0].tarif_net_mensuel).toBe(100);
  });

  it('replays additions and deletions without accepting client supplied totals', () => {
    const operations = SaOperationsSchema.parse([
      { kind: 'add', input: { section: 'location', designation: 'Téléphone', quantite: 2, montant: 10 } },
      { kind: 'delete', id: 'locations:0' },
    ]);
    expect(calculateSaCartSummary(buildEditedSaData(base(), operations)).totalMensuel).toBe(120);
    expect(SaOperationsSchema.safeParse([{ kind: 'update', id: 'abonnements:0', patch: { montant: -1 } }]).success).toBe(false);
    expect(SaOperationsSchema.safeParse([{ kind: 'update', id: 'abonnements:0', patch: { total_ht_mensuel_client: 1 } }]).success).toBe(false);
  });

  it('preserves extracted totals and source prose when confirmed without edits', () => {
    expect(buildEditedSaData(base(), [])).toEqual(base());
  });

  it('requires confirmation for new direct extractions and keeps legacy proposals accessible', () => {
    expect(requiresSaConfirmation(base())).toBe(true);
    expect(requiresSaConfirmation({})).toBe(false);
    const confirmed = { ...base(), _sa_confirmation: { confirmed_at: '2026-11-17T10:00:00Z' } };
    expect(isSaConfirmed(confirmed)).toBe(true);
    expect(requiresSaConfirmation(confirmed)).toBe(false);
  });

  it('keeps a zero-priced new subscription visible and editable', () => {
    const result = buildEditedSaData({ situation_actuelle: { lignes: [] } }, [
      { kind: 'add', input: { section: 'abonnement', designation: 'Nouvelle ligne', montant: 0, quantite: 1 } },
    ]);
    expect(getSaEditableLines(result.situation_actuelle, true)).toMatchObject([{ designation: 'Nouvelle ligne', montant: 0 }]);
  });

  it('uses stable materialized IDs for aggregate amounts, matching server replay', () => {
    const data = { situation_actuelle: { lignes: [], total_ht_mensuel_client: 100, totaux: { total_abonnements_source: 100, total_solution_actuelle_source: 100 } } };
    const line = getSaEditableLines(prepareSaForEditing(data.situation_actuelle), true)[0];
    const result = buildEditedSaData(data, [{ kind: 'update', id: line.id, patch: { montant: 60 } }]);
    expect(calculateSaCartSummary(result).totalMensuel).toBe(60);
    expect(getSaEditableLines(prepareSaForEditing(result.situation_actuelle), true)[0].id).toBe(line.id);
  });

  it('allows setting extracted prices to zero without falling back to gross amounts', () => {
    const data = base();
    Object.assign(data.situation_actuelle.abonnements[0], { tarif_brut_mensuel: 100 });
    Object.assign(data.situation_actuelle.locations[0], { loyer_brut_mensuel: 5 });
    const result = buildEditedSaData(data, [
      { kind: 'update', id: 'abonnements:0', patch: { montant: 0 } },
      { kind: 'update', id: 'locations:0', patch: { montant: 0 } },
    ]);
    expect(calculateSaCartSummary(result).totalMensuel).toBe(0);
  });

  it('does not count informative phone rows again after removing the last subscription', () => {
    const data = base();
    const sa = { ...data.situation_actuelle, lignes: [{ libelle: 'Fibre', tarif_net_mensuel: 100, type: 'internet' }] };
    const result = buildEditedSaData({ ...data, situation_actuelle: sa }, [{ kind: 'delete', id: 'abonnements:0' }]);
    expect(calculateSaCartSummary(result).totalMensuel).toBe(5);
    expect(result.situation_actuelle).toMatchObject({ lignes: [] });
  });

  it('applies quantities when subscriptions are represented only by phone rows', () => {
    const result = buildEditedSaData({ situation_actuelle: { lignes: [
      { libelle: 'Mobile', type: 'mobile', tarif_net_mensuel: 10, quantite: 1 },
    ] } }, [{ kind: 'update', id: 'lignes:0', patch: { quantite: 3 } }]);
    expect(calculateSaCartSummary(result).totalMensuel).toBe(30);
  });

  it.each(['abonnement', 'location', 'variable'] as const)('counts two explicitly added identical %s rows', section => {
    const input = { section, designation: 'Nouvelle ligne', quantite: 1, montant: 10 };
    const result = buildEditedSaData({ situation_actuelle: {} }, [
      { kind: 'add', input }, { kind: 'add', input },
    ]);
    expect(calculateSaCartSummary(result).totalMensuel).toBe(20);
  });
});
