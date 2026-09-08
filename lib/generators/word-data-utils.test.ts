import { describe, expect, it } from 'vitest';
import { buildSaWordData, type UnknownRecord } from './word-data-utils';

function euro(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

describe('buildSaWordData', () => {
  // Régression : la charge variable (hors forfait) doit apparaître dans le
  // même tableau {{#lignes}} que les autres lignes SA, avec les mêmes clés
  // {{designation}}/{{prix_mensuel_ht}} — pas dans un tableau Word séparé.
  it('fusionne les charges variables dans {{#lignes}} avec designation/prix_mensuel_ht', () => {
    const baseData: UnknownRecord = {
      situation_actuelle: {
        abonnements: [
          { libelle: 'Forfait Pro', tarif_net_mensuel: 50, quantite: 1 },
        ],
        charges_variables: [
          { libelle: 'Consommation hors forfait', montant: 19.94 },
        ],
        totaux: { charges_variables_incluses: true },
      },
    };

    const out = buildSaWordData(baseData);
    const lignes = out.lignes as UnknownRecord[];

    expect(Array.isArray(lignes)).toBe(true);
    const variableLine = lignes.find((l) => l.designation === 'Consommation Hors Forfait');
    expect(variableLine).toBeDefined();
    expect(variableLine?.prix_mensuel_ht).toBe(euro(19.94));
  });

  it("ne fusionne pas la charge variable quand le template l'exclut du total (charges_variables_incluses: false)", () => {
    const baseData: UnknownRecord = {
      situation_actuelle: {
        abonnements: [
          { libelle: 'Forfait Pro', tarif_net_mensuel: 50, quantite: 1 },
        ],
        charges_variables: [
          { libelle: 'Consommation hors forfait', montant: 19.94 },
        ],
        totaux: { charges_variables_incluses: false },
      },
    };

    const out = buildSaWordData(baseData);
    const lignes = out.lignes as UnknownRecord[];

    expect(lignes.some((l) => l.designation === 'Consommation Hors Forfait')).toBe(false);
  });

  it('ne duplique pas la charge variable si elle est déjà présente via le tableau de secours', () => {
    // Un seul abonnement + une charge variable : buildSituationActuelleLines()
    // (chemin de secours) inclut déjà la charge variable dans son propre
    // calcul ; la fusion ne doit pas l'ajouter une seconde fois.
    const baseData: UnknownRecord = {
      situation_actuelle: {
        abonnements: [
          { libelle: 'Forfait Pro', tarif_net_mensuel: 50, quantite: 1 },
        ],
        charges_variables: [
          { libelle: 'Consommation hors forfait', montant: 19.94 },
        ],
        totaux: { charges_variables_incluses: true },
      },
    };

    const out = buildSaWordData(baseData);
    const lignes = out.lignes as UnknownRecord[];
    const matches = lignes.filter((l) => l.designation === 'Consommation Hors Forfait');
    expect(matches.length).toBe(1);
  });

  it('regroupe les numéros mobiles et fixes détectés dans un tableau SA dédié', () => {
    const baseData: UnknownRecord = {
      lignes_mobiles: [
        { numero_ligne: '06.12.34.56.78', tarif: 19.99 },
      ],
      situation_actuelle: {
        lignes: [
          { type: 'fixe', numero_ligne: '01 23 45 67 89', tarif_brut_mensuel: 35, tarif_net_mensuel: 29 },
          { type: 'internet', numero_ligne: '09 87 65 43 21', tarif_net_mensuel: 40 },
          { type: 'mobile', numero_ligne: '', tarif_net_mensuel: 12 },
        ],
      },
    };

    const out = buildSaWordData(baseData);

    expect(out.sa_lignes_telephoniques).toEqual([
      { sa_type_ligne: 'Mobile', sa_numero: '06 12 34 56 78', sa_prix_mensuel_ht: euro(19.99) },
      { sa_type_ligne: 'Fixe', sa_numero: '01 23 45 67 89', sa_prix_mensuel_ht: euro(29) },
    ]);
  });
});
