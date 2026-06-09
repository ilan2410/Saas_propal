import type { SuggestionsSpCompletes, SpAdresse, SpTableauFusionne } from '@/types';
import { deepApplyTitleCase } from '@/lib/generators/word-data-utils';

function sanitizeLineNumber(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const firstDigitIndex = trimmed.search(/\d/);
  if (firstDigitIndex < 0) return '';

  const digitCount = trimmed.replace(/\D/g, '').length;
  if (digitCount < 8) return '';

  const withoutLeadingText = trimmed.slice(firstDigitIndex);
  const withoutParentheses = withoutLeadingText.replace(/\([^)]*\)/g, ' ');
  return withoutParentheses
    .replace(/[A-Za-zÀ-ÿ]+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSpArrayRows(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const item = row as Record<string, unknown>;
    const out = { ...item };
    if ('sp_numero' in out) out.sp_numero = sanitizeLineNumber(out.sp_numero);
    if ('sp_sp_numero' in out) out.sp_sp_numero = sanitizeLineNumber(out.sp_sp_numero);
    return out;
  });
}

export function buildSpWordData(
  sp: SuggestionsSpCompletes | null | undefined,
  tableauxFusionnes?: SpTableauFusionne[],
): Record<string, unknown> {
  if (!sp) return {};

  const adresseFact = sp.sp_adresse_facturation;
  // Pour la variable 1-ligne formatée, livraison = facturation si identique
  const adresseLivDisplay = sp.sp_livraison_identique ? adresseFact : sp.sp_adresse_livraison;
  // Pour les 9 champs SP, livraison est vide si identique (les champs facturation suffisent)
  const adresseLiv = sp.sp_livraison_identique ? null : sp.sp_adresse_livraison;

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
    sp_adresse_livraison: adresseLivDisplay ? formatAdresse(adresseLivDisplay) : '',
    sp_livraison_identique: sp.sp_livraison_identique ? 'Oui' : 'Non',

    Adresse_facturation_SP_societe:      adresseFact?.societe ?? '',
    Adresse_facturation_SP_adresse:      adresseFact?.adresse ?? '',
    Adresse_facturation_SP_cp:           adresseFact?.code_postal ?? '',
    Adresse_facturation_SP_ville:        adresseFact?.ville ?? '',
    Adresse_facturation_SP_contact:      adresseFact?.contact ?? '',
    Adresse_facturation_SP_ligne_fixe:   adresseFact?.ligne_fixe ?? '',
    Adresse_facturation_SP_ligne_mobile: adresseFact?.ligne_mobile ?? '',
    Adresse_facturation_SP_email:        adresseFact?.email ?? '',
    Adresse_facturation_SP_siret:        adresseFact?.siret ?? '',

    Adresse_livraison_SP_societe:        adresseLiv?.societe ?? '',
    Adresse_livraison_SP_adresse:        adresseLiv?.adresse ?? '',
    Adresse_livraison_SP_cp:             adresseLiv?.code_postal ?? '',
    Adresse_livraison_SP_ville:          adresseLiv?.ville ?? '',
    Adresse_livraison_SP_contact:        adresseLiv?.contact ?? '',
    Adresse_livraison_SP_ligne_fixe:     adresseLiv?.ligne_fixe ?? '',
    Adresse_livraison_SP_ligne_mobile:   adresseLiv?.ligne_mobile ?? '',
    Adresse_livraison_SP_email:          adresseLiv?.email ?? '',
    Adresse_livraison_SP_siret:          adresseLiv?.siret ?? '',

    sp_lignes_mobiles: normalizeSpArrayRows(sp.sp_lignes_mobiles ?? []),
    sp_lignes_fixes: normalizeSpArrayRows(sp.sp_lignes_fixes ?? []),
    sp_internet: normalizeSpArrayRows(sp.sp_internet ?? []),
    sp_materiel: sp.sp_materiel ?? [],
    sp_situation_proposee_complet: normalizeSpArrayRows(sp.sp_situation_proposee_complet ?? []),
    sp_situation_proposee_forfaits: normalizeSpArrayRows(sp.sp_situation_proposee_forfaits ?? []),
    sp_situation_proposee_forfaits_sans_remise: normalizeSpArrayRows(sp.sp_situation_proposee_forfaits_sans_remise ?? []),
    sp_materiel_detail: sp.sp_materiel_detail ?? [],
    sp_bdc_operateur_table: sp.sp_bdc_operateur_table ?? [],
    sp_bdc_internet_table: sp.sp_bdc_internet_table ?? [],
    sp_bdc_materiel_table: sp.sp_bdc_materiel_table ?? [],
    sp_cadeaux_table: sp.sp_cadeaux_table ?? [],

    sp_fixes_mobiles: normalizeSpArrayRows(sp.sp_fixes_mobiles ?? []),
    sp_fixes_mobiles_internet: normalizeSpArrayRows(sp.sp_fixes_mobiles_internet ?? []),
    sp_toutes_lignes: normalizeSpArrayRows(sp.sp_toutes_lignes ?? []),
    sp_tout: sp.sp_tout ?? [],

    sp_date_limite_souscription: sp.sp_date_limite_souscription ?? '',
    sp_duree_trimestres: sp.sp_duree_trimestres ?? '',
    sp_total_forfaits_mensuel_ht: sp.sp_total_forfaits_mensuel_ht ?? '',
    sp_total_materiel_ht: sp.sp_total_materiel_ht ?? '',
    sp_total_bdc_operateur_ht: sp.sp_total_bdc_operateur_ht ?? '',
    sp_total_bdc_internet_ht: sp.sp_total_bdc_internet_ht ?? '',
    sp_total_bdc_materiel_ht: sp.sp_total_bdc_materiel_ht ?? '',
    sp_total_cadeaux_ht: sp.sp_total_cadeaux_ht ?? '',
    sp_total_complet: sp.sp_total_complet ?? '',

    sp_total_recurrent: sp.sp_total_recurrent ?? '',
    sp_total_ponctuel: sp.sp_total_ponctuel ?? '',
    sp_total_indemnites: sp.sp_total_indemnites ?? '',
    sp_remise_mois_offert: sp.sp_remise_mois_offert ?? '',
    sp_total_fas: sp.sp_total_fas ?? '',
    sp_total_installation: sp.sp_total_installation ?? '',
    sp_total_materiel_achat: sp.sp_total_materiel_achat ?? '',
    sp_fas_total: sp.sp_fas_total ?? '',

    sp_loyer_mensuel: sp.sp_loyer_mensuel ?? '',
    sp_loyer_trimestriel: sp.sp_loyer_trimestriel ?? '',
    sp_marge: sp.sp_marge ?? '',
    sp_duree_mois: sp.sp_duree_mois ?? '',
    sp_trimestres: sp.sp_trimestres ?? '',
    sp_mois_offerts: sp.sp_mois_offerts ?? '',
  };

  if (tableauxFusionnes) {
    for (const fusion of tableauxFusionnes) {
      if (sp[fusion.id] !== undefined) {
        data[fusion.id] = Array.isArray(sp[fusion.id])
          ? normalizeSpArrayRows(sp[fusion.id] as unknown[])
          : sp[fusion.id];
      } else {
        const items: unknown[] = [];
        const map: Record<string, unknown[]> = {
          mobiles: normalizeSpArrayRows(sp.sp_lignes_mobiles ?? []),
          fixes: normalizeSpArrayRows(sp.sp_lignes_fixes ?? []),
          internet: normalizeSpArrayRows(sp.sp_internet ?? []),
          materiel: sp.sp_materiel ?? [],
        };
        for (const cat of fusion.categories) {
          items.push(...(map[cat] ?? []));
        }
        data[fusion.id] = items;
      }
    }
  }

  return deepApplyTitleCase(data) as Record<string, unknown>;
}

function formatAdresse(a: SpAdresse): string {
  return [a.adresse, a.complement, `${a.code_postal} ${a.ville}`, a.pays]
    .filter(Boolean)
    .join(', ');
}
