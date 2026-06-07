import type { SuggestionsSpCompletes, SpAdresse, SpTableauFusionne } from '@/types';

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

  return data;
}

function formatAdresse(a: SpAdresse): string {
  return [a.adresse, a.complement, `${a.code_postal} ${a.ville}`, a.pays]
    .filter(Boolean)
    .join(', ');
}
