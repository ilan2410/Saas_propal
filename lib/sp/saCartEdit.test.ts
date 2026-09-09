import { describe, expect, it } from 'vitest';
import { calculateSaCartSummary } from './calculateSaCart';
import { applySaEdit, getSaEditableLines } from './saCartEdit';

/**
 * SA telle que produite par le pipeline d'extraction : les lignes détaillées ET
 * les totaux de réconciliation (`totaux.*_source`, `total_ht_mensuel_client`,
 * `total_abonnements` / `total_loyer_mensuel` / `total_materiel`) sont cohérents
 * entre eux au départ.
 */
function makeSa(): Record<string, unknown> {
  return {
    abonnements: [
      { libelle: 'Connect Pro Open Fibre', tarif_net_mensuel: 86, quantite: 1 },
      { libelle: 'Option Fax in mail', tarif_net_mensuel: 10, quantite: 1 },
    ],
    locations: [{ libelle: 'location Livebox pro', loyer_net_mensuel: 5, quantite: 1 }],
    charges_variables: [{ libelle: 'vers services spéciaux', montant: 25.48 }],
    total_ht_mensuel_client: 126.48,
    total_abonnements: 96,
    total_loyer_mensuel: 126.48,
    total_materiel: 5,
    totaux: {
      total_abonnements_source: 96,
      total_abonnements_calcule: 96,
      total_locations_source: 5,
      total_locations_calcule: 5,
      total_charges_variables_source: 25.48,
      total_charges_variables_calcule: 25.48,
      total_solution_actuelle_source: 126.48,
      total_solution_actuelle_calcule: 126.48,
      charges_variables_incluses: true,
    },
  };
}

function summaryOf(sa: Record<string, unknown>) {
  return calculateSaCartSummary({ situation_actuelle: sa });
}

function lineIdByLabel(sa: Record<string, unknown>, label: string): string {
  const line = getSaEditableLines(sa).find((l) => l.designation === label);
  if (!line) throw new Error(`Ligne introuvable : ${label}`);
  return line.id;
}

describe('applySaEdit — recalcul des totaux', () => {
  it('part d’une SA cohérente', () => {
    const summary = summaryOf(makeSa());
    expect(summary.abonnements).toBe(96);
    expect(summary.locations).toBe(5);
    expect(summary.chargesVariables).toBe(25.48);
    expect(summary.totalMensuel).toBe(126.48);
  });

  it('modifier le prix d’un abonnement recalcule le total abonnements ET le total du panier', () => {
    const sa = makeSa();
    const next = applySaEdit(sa, {
      kind: 'update',
      id: lineIdByLabel(sa, 'Connect Pro Open Fibre'),
      patch: { montant: 100 },
    });
    const summary = summaryOf(next);

    expect(summary.abonnements).toBe(110);
    expect(summary.totalMensuel).toBe(140.48);
    expect(summary.details.every((l) => l.libelle !== 'Autres éléments (non détaillés)')).toBe(true);
  });

  it('modifier le prix d’une location recalcule le total matériel ET le total du panier', () => {
    const sa = makeSa();
    const next = applySaEdit(sa, {
      kind: 'update',
      id: lineIdByLabel(sa, 'location Livebox pro'),
      patch: { montant: 12 },
    });
    const summary = summaryOf(next);

    expect(summary.locations).toBe(12);
    expect(summary.totalMensuel).toBe(133.48);
  });

  it('supprimer une ligne retire bien son montant du total', () => {
    const sa = makeSa();
    const next = applySaEdit(sa, { kind: 'delete', id: lineIdByLabel(sa, 'Option Fax in mail') });
    const summary = summaryOf(next);

    expect(summary.abonnements).toBe(86);
    expect(summary.totalMensuel).toBe(116.48);
  });

  it('resynchronise les variables Word dérivées (total_abonnements, total_loyer_mensuel, total_materiel)', () => {
    const sa = makeSa();
    const next = applySaEdit(sa, {
      kind: 'update',
      id: lineIdByLabel(sa, 'Connect Pro Open Fibre'),
      patch: { montant: 100 },
    });

    expect(next.total_ht_mensuel_client).toBe(140.48);
    expect(next.total_abonnements).toBe(110);
    expect(next.total_loyer_mensuel).toBe(140.48);
    expect(next.total_materiel).toBe(5);
  });

  it('n’altère pas l’objet d’entrée', () => {
    const sa = makeSa();
    applySaEdit(sa, { kind: 'update', id: lineIdByLabel(sa, 'Connect Pro Open Fibre'), patch: { montant: 100 } });
    expect(summaryOf(sa).totalMensuel).toBe(126.48);
  });
});

describe('applySaEdit — charges variables', () => {
  it('les expose comme lignes éditables', () => {
    const lines = getSaEditableLines(makeSa()).filter((l) => l.section === 'variable');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ designation: 'vers services spéciaux', montant: 25.48 });
  });

  it('modifier une charge variable recalcule son total et le total du panier', () => {
    const sa = makeSa();
    const next = applySaEdit(sa, {
      kind: 'update',
      id: lineIdByLabel(sa, 'vers services spéciaux'),
      patch: { montant: 30 },
    });
    const summary = summaryOf(next);

    expect(summary.chargesVariables).toBe(30);
    expect(summary.totalMensuel).toBe(131);
  });

  it('supprimer une charge variable la retire du total', () => {
    const sa = makeSa();
    const next = applySaEdit(sa, { kind: 'delete', id: lineIdByLabel(sa, 'vers services spéciaux') });
    const summary = summaryOf(next);

    expect(summary.chargesVariables).toBe(0);
    expect(summary.totalMensuel).toBe(101);
  });

  it('ajouter une charge variable l’ajoute au total', () => {
    const next = applySaEdit(makeSa(), {
      kind: 'add',
      input: { section: 'variable', designation: 'Pénalité de retard', quantite: 1, montant: 15 },
    });
    const summary = summaryOf(next);

    expect(summary.chargesVariables).toBe(40.48);
    expect(summary.totalMensuel).toBe(141.48);
  });

  it('respecte charges_variables_incluses=false pour le total mensuel', () => {
    const sa = makeSa();
    (sa.totaux as Record<string, unknown>).charges_variables_incluses = false;
    (sa.totaux as Record<string, unknown>).total_solution_actuelle_source = 101;
    sa.total_ht_mensuel_client = 101;
    sa.total_loyer_mensuel = 101;

    const next = applySaEdit(sa, {
      kind: 'update',
      id: lineIdByLabel(sa, 'vers services spéciaux'),
      patch: { montant: 30 },
    });
    const summary = summaryOf(next);

    expect(summary.chargesVariables).toBe(30);
    expect(summary.totalMensuel).toBe(101);
  });
});

describe('applySaEdit — charges variables agrégées (sans détail ligne à ligne)', () => {
  function makeAggregateSa(): Record<string, unknown> {
    return {
      abonnements: [{ libelle: 'Connect Pro Open Fibre', tarif_net_mensuel: 86, quantite: 1 }],
      locations: [],
      charges_variables: [],
      total_ht_mensuel_client: 111.48,
      totaux: {
        total_abonnements_source: 86,
        total_charges_variables_source: 25.48,
        total_solution_actuelle_source: 111.48,
        charges_variables_incluses: true,
      },
    };
  }

  it('les expose comme une ligne agrégée éditable', () => {
    const lines = getSaEditableLines(makeAggregateSa()).filter((l) => l.section === 'variable');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: 'aggregate:variable', montant: 25.48 });
  });

  it('ne perd pas les charges agrégées quand on modifie un abonnement', () => {
    const sa = makeAggregateSa();
    const next = applySaEdit(sa, {
      kind: 'update',
      id: lineIdByLabel(sa, 'Connect Pro Open Fibre'),
      patch: { montant: 100 },
    });
    const summary = summaryOf(next);

    expect(summary.abonnements).toBe(100);
    expect(summary.chargesVariables).toBe(25.48);
    expect(summary.totalMensuel).toBe(125.48);
  });

  it('permet de modifier directement le montant agrégé', () => {
    const next = applySaEdit(makeAggregateSa(), {
      kind: 'update',
      id: 'aggregate:variable',
      patch: { montant: 40 },
    });
    const summary = summaryOf(next);

    expect(summary.chargesVariables).toBe(40);
    expect(summary.totalMensuel).toBe(126);
  });

  it('permet de supprimer le montant agrégé', () => {
    const next = applySaEdit(makeAggregateSa(), { kind: 'delete', id: 'aggregate:variable' });
    const summary = summaryOf(next);

    expect(summary.chargesVariables).toBe(0);
    expect(summary.totalMensuel).toBe(86);
  });
});
