import type { SuggestionsSpCompletes, SpAdresse, SpTableauFusionne } from '@/types';

export function buildSpWordData(
  sp: SuggestionsSpCompletes | null | undefined,
  tableauxFusionnes?: SpTableauFusionne[],
): Record<string, unknown> {
  if (!sp) return {};

  const adresseFact = sp.sp_adresse_facturation;
  const adresseLiv = sp.sp_livraison_identique
    ? adresseFact
    : sp.sp_adresse_livraison;

  const data: Record<string, unknown> = {
    sp_economie_mensuelle: sp.sp_economie_mensuelle ?? '',
    sp_economie_annuelle: sp.sp_economie_annuelle ?? '',
    sp_total_actuel: sp.sp_total_actuel ?? '',
    sp_total_propose: sp.sp_total_propose ?? '',
    sp_ameliorations: sp.sp_ameliorations ?? '',
    sp_nb_lignes: sp.sp_nb_lignes ?? '',
    sp_est_economie: sp.sp_est_economie ?? '',
    sp_fournisseur_propose: sp.sp_fournisseur_propose ?? '',

    sp_adresse_facturation: adresseFact ? formatAdresse(adresseFact) : '',
    sp_adresse_facturation_rue: adresseFact?.adresse ?? '',
    sp_adresse_facturation_cp: adresseFact?.code_postal ?? '',
    sp_adresse_facturation_ville: adresseFact?.ville ?? '',

    sp_adresse_livraison: adresseLiv ? formatAdresse(adresseLiv) : '',
    sp_adresse_livraison_rue: adresseLiv?.adresse ?? adresseFact?.adresse ?? '',
    sp_adresse_livraison_cp: adresseLiv?.code_postal ?? adresseFact?.code_postal ?? '',
    sp_adresse_livraison_ville: adresseLiv?.ville ?? adresseFact?.ville ?? '',
    sp_livraison_identique: sp.sp_livraison_identique ? 'Oui' : 'Non',

    sp_lignes_mobiles: sp.sp_lignes_mobiles ?? [],
    sp_lignes_fixes: sp.sp_lignes_fixes ?? [],
    sp_internet: sp.sp_internet ?? [],
    sp_materiel: sp.sp_materiel ?? [],
    sp_situation_proposee_complet: sp.sp_situation_proposee_complet ?? [],
    sp_situation_proposee_forfaits: sp.sp_situation_proposee_forfaits ?? [],
    sp_materiel_detail: sp.sp_materiel_detail ?? [],
    sp_bdc_operateur_table: sp.sp_bdc_operateur_table ?? [],
    sp_bdc_internet_table: sp.sp_bdc_internet_table ?? [],
    sp_bdc_materiel_table: sp.sp_bdc_materiel_table ?? [],
    sp_cadeaux_table: sp.sp_cadeaux_table ?? [],

    sp_fixes_mobiles: sp.sp_fixes_mobiles ?? [],
    sp_fixes_mobiles_internet: sp.sp_fixes_mobiles_internet ?? [],
    sp_toutes_lignes: sp.sp_toutes_lignes ?? [],
    sp_tout: sp.sp_tout ?? [],
  };

  if (tableauxFusionnes) {
    for (const fusion of tableauxFusionnes) {
      if (sp[fusion.id] !== undefined) {
        data[fusion.id] = sp[fusion.id];
      } else {
        const items: unknown[] = [];
        const map: Record<string, unknown[]> = {
          mobiles: sp.sp_lignes_mobiles ?? [],
          fixes: sp.sp_lignes_fixes ?? [],
          internet: sp.sp_internet ?? [],
          materiel: sp.sp_materiel ?? [],
        };
        for (const cat of fusion.categories) {
          items.push(...(map[cat] ?? []));
        }
        data[fusion.id] = items;
      }
    }
  }

  return data;
}

function formatAdresse(a: SpAdresse): string {
  return [a.adresse, a.complement, `${a.code_postal} ${a.ville}`, a.pays]
    .filter(Boolean)
    .join(', ');
}
