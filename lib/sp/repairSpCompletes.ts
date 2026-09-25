import { calculateCartSummary, type CartLine } from '@/lib/sp/calculateCart';
import { orderProductBuckets } from '@/lib/sp/categoryOrder';
import { getTableProductOrder, orderProductsByPreference } from '@/lib/sp/productTableOrder';
import { formatBdcOperatorNameWithNumber } from '@/lib/sp/bdcOperator';
import type {
  CatalogueProduit,
  SpBdcInternetLigne,
  SpBdcMaterielLigne,
  SpBdcOperateurLigne,
  SpCadeauLigne,
  SpCategorie,
  SpConfigLoyer,
  SpConfigMoisOfferts,
  SpInternet,
  SpLigneFixe,
  SpLigneMobile,
  SpMateriel,
  SpMaterielDetail,
  SpPreferencesProduits,
  SpQuestion,
  SpQuestionReponse,
  SpSituationProposeeLigne,
  SpTableProductOrders,
  SuggestionsSpCompletes,
} from '@/types';

type UnknownRecord = Record<string, unknown>;

function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function parsePositiveQuantity(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function findCatalogueMensuelProduit(
  catalogueMap: Map<string, CatalogueProduit>,
  produitId?: string,
  produitNom?: string,
): CatalogueProduit | undefined {
  if (produitId && catalogueMap.has(produitId)) return catalogueMap.get(produitId);
  if (produitNom) {
    for (const item of catalogueMap.values()) {
      if (item.nom === produitNom) return item;
    }
  }
  return undefined;
}

function buildForfaitsSansRemiseTable(
  lignes: Array<SpLigneMobile | SpLigneFixe | SpInternet>,
  catalogueMap: Map<string, CatalogueProduit>,
): SpSituationProposeeLigne[] {
  const rows: SpSituationProposeeLigne[] = [];
  let remiseTotale = 0;

  for (const ligne of lignes) {
    const quantite = parsePositiveQuantity(ligne.sp_quantite);
    const catalogueItem = findCatalogueMensuelProduit(catalogueMap, ligne.sp_produit_id, ligne.sp_produit);
    const originalUnitPrice = catalogueItem?.prix_mensuel ?? (ligne._prix_propose_raw / quantite);
    const originalTotal = originalUnitPrice * quantite;
    const remiseLigne = originalTotal - ligne._prix_propose_raw;

    rows.push({
      sp_sp_type: ligne.sp_type_ligne,
      sp_sp_nom: ligne.sp_nom_ligne,
      sp_sp_numero: ligne.sp_numero,
      sp_sp_quantite: ligne.sp_quantite,
      sp_sp_produit: ligne.sp_produit,
      sp_sp_fournisseur: ligne.sp_produit_fournisseur,
      sp_sp_prix_actuel: ligne.sp_prix_actuel,
      sp_sp_prix_propose: formatEuro(originalTotal),
      sp_sp_economie: ligne.sp_economie,
      sp_sp_analyse: ligne.sp_analyse,
      _prix_raw: originalTotal,
    });

    if (remiseLigne > 0.005) remiseTotale += remiseLigne;
  }

  if (remiseTotale > 0.005) {
    rows.push({
      sp_sp_type: '',
      sp_sp_nom: 'Remise',
      sp_sp_numero: '',
      sp_sp_quantite: '',
      sp_sp_produit: 'Remise',
      sp_sp_fournisseur: '',
      sp_sp_prix_actuel: undefined,
      sp_sp_prix_propose: formatEuro(-remiseTotale),
      sp_sp_economie: undefined,
      sp_sp_analyse: '',
      _prix_raw: -remiseTotale,
    });
  }

  return rows;
}

function buildRemiseBreakdown(
  lignes: Array<SpLigneMobile | SpLigneFixe | SpInternet>,
  catalogueMap: Map<string, CatalogueProduit>,
): { total: number; fixe: number; mobile: number; internet: number } {
  let fixe = 0;
  let mobile = 0;
  let internet = 0;

  for (const ligne of lignes) {
    const quantite = parsePositiveQuantity(ligne.sp_quantite);
    const catalogueItem = findCatalogueMensuelProduit(catalogueMap, ligne.sp_produit_id, ligne.sp_produit);
    const originalUnitPrice = catalogueItem?.prix_mensuel ?? (ligne._prix_propose_raw / quantite);
    const remiseLigne = originalUnitPrice * quantite - ligne._prix_propose_raw;
    if (remiseLigne <= 0.005) continue;

    if (ligne.sp_type_ligne === 'Mobile') mobile += remiseLigne;
    else if (ligne.sp_type_ligne === 'Fixe') fixe += remiseLigne;
    else if (ligne.sp_type_ligne === 'Internet') internet += remiseLigne;
  }

  return { total: fixe + mobile + internet, fixe, mobile, internet };
}

function rebuildTelecomLinesFromQuestionnaire<T extends SpLigneMobile | SpLigneFixe | SpInternet>(
  existingLines: T[],
  cartLines: CartLine[],
  lineType: T['sp_type_ligne'],
  catalogueMap: Map<string, CatalogueProduit>,
): T[] {
  if (cartLines.length === 0) return existingLines;

  return cartLines.map((cartLine, index) => {
    const existing = existingLines[index];
    const catalogueItem = cartLine.produitId ? catalogueMap.get(cartLine.produitId) : undefined;
    const prixActuel = existing?._prix_actuel_raw ?? 0;
    const prixPropose = cartLine.prixTotal;
    const economie = prixActuel - prixPropose;

    return {
      sp_nom_ligne: existing?.sp_nom_ligne ?? cartLine.produitNom,
      sp_numero: existing?.sp_numero,
      sp_quantite: String(cartLine.quantite),
      sp_produit: cartLine.produitNom,
      sp_produit_id: cartLine.produitId ?? existing?.sp_produit_id,
      sp_produit_fournisseur: catalogueItem?.fournisseur ?? existing?.sp_produit_fournisseur,
      sp_prix_actuel: formatEuro(prixActuel),
      sp_prix_propose: formatEuro(prixPropose),
      sp_economie: formatEuro(economie),
      sp_analyse: existing?.sp_analyse ?? '',
      sp_justification: existing?.sp_justification ?? '',
      sp_type_ligne: lineType,
      _prix_actuel_raw: prixActuel,
      _prix_propose_raw: prixPropose,
      _economie_raw: economie,
    } as T;
  });
}

/**
 * Reconstruit l'intégralité d'une SP (forfaits, matériel, cadeaux, loyer, remises,
 * indemnités) à partir des dernières réponses au questionnaire + du panier calculé.
 * Fonction pure, partagée entre l'aperçu Word et la génération du document final
 * pour garantir un rendu identique partout.
 */
export function repairSpCompletesFromQuestionnaire(
  sp: SuggestionsSpCompletes | null,
  reponses: SpQuestionReponse[],
  questions: SpQuestion[],
  catalogue: CatalogueProduit[],
  donneesExtraites: UnknownRecord,
  spConfigLoyer?: SpConfigLoyer,
  spConfigMoisOfferts?: SpConfigMoisOfferts,
  spPreferencesProduits?: SpPreferencesProduits,
  spCategoriesOrder?: SpCategorie[],
  spTableProductOrders?: SpTableProductOrders,
): SuggestionsSpCompletes | null {
  if (!sp || reponses.length === 0 || questions.length === 0 || catalogue.length === 0) return sp;

  const cart = calculateCartSummary(reponses, questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts, spPreferencesProduits);
  const catalogueMap = new Map<string, CatalogueProduit>();
  for (const item of catalogue) catalogueMap.set(item.id, item);
  const mobileCartLines = cart.lines.filter((line) => line.type_frequence === 'mensuel' && line.categorie === 'mobile');
  const fixeCartLines = cart.lines.filter((line) => line.type_frequence === 'mensuel' && line.categorie === 'fixe');
  const internetCartLines = cart.lines.filter((line) => line.type_frequence === 'mensuel' && line.categorie === 'internet');
  const hasTelecomSelections = mobileCartLines.length > 0 || fixeCartLines.length > 0 || internetCartLines.length > 0;

  const mobiles = hasTelecomSelections
    ? (mobileCartLines.length > 0 ? rebuildTelecomLinesFromQuestionnaire(sp.sp_lignes_mobiles ?? [], mobileCartLines, 'Mobile', catalogueMap) : [])
    : (sp.sp_lignes_mobiles ?? []);
  const fixes = hasTelecomSelections
    ? (fixeCartLines.length > 0 ? rebuildTelecomLinesFromQuestionnaire(sp.sp_lignes_fixes ?? [], fixeCartLines, 'Fixe', catalogueMap) : [])
    : (sp.sp_lignes_fixes ?? []);
  const internet = hasTelecomSelections
    ? (internetCartLines.length > 0 ? rebuildTelecomLinesFromQuestionnaire(sp.sp_internet ?? [], internetCartLines, 'Internet', catalogueMap) : [])
    : (sp.sp_internet ?? []);
  const toutes = orderProductBuckets(
    { internet, fixe: fixes, mobile: mobiles },
    spCategoriesOrder,
  );

  // ── Reconstruire le matériel à partir des réponses du questionnaire ─────
  // Exclure les catégories telecom (gérées séparément) ET les cadeaux (sp_cadeaux_table)
  const materielCartLines = cart.lines.filter((line) =>
    !['mobile', 'fixe', 'internet', 'cadeau'].includes(line.categorie)
  );
  const sp_materiel: SpMateriel[] = materielCartLines.map((line) => {
    const cat = line.produitId ? catalogueMap.get(line.produitId) : undefined;
    return {
      sp_materiel_nom: line.produitNom,
      sp_materiel_ref: undefined,
      sp_materiel_fournisseur: cat?.fournisseur,
      sp_materiel_prix_mensuel: formatEuro(line.prixTotal),
      sp_materiel_duree_engagement: '',
      sp_materiel_commentaire: '',
      sp_materiel_produit_id: line.produitId,
      sp_type_ligne: 'Materiel',
      _prix_mensuel_raw: line.prixTotal,
    };
  });

  const materielDetailLines = orderProductsByPreference(
    materielCartLines,
    getTableProductOrder(spTableProductOrders, 'sp_materiel_detail'),
    (line) => line.produitId,
  );
  const sp_materiel_detail: SpMaterielDetail[] = materielDetailLines.map((line) => {
    const isLibre = !line.produitId;
    const cat = !isLibre && line.produitId ? catalogueMap.get(line.produitId) : undefined;
    const freq = isLibre ? 'unique' : (cat?.type_frequence ?? 'mensuel');
    const imageUrl = !isLibre && typeof cat?.image_url === 'string' ? cat.image_url : undefined;
    const description = !isLibre && typeof cat?.description === 'string' ? cat.description : '';
    return {
      sp_matd_nom: line.produitNom,
      sp_matd_ref: undefined,
      sp_matd_fournisseur: cat?.fournisseur,
      sp_matd_quantite: String(line.quantite ?? 1),
      sp_matd_prix_ht: formatEuro(line.prixTotal),
      sp_matd_description: description,
      sp_matd_frequence: freq === 'unique' ? 'Achat unique' : 'Mensuel',
      sp_matd_image_url: imageUrl,
      sp_mat_image_url: imageUrl,
      _prix_raw: line.prixTotal,
    };
  });

  const toSituationLigne = (line: SpLigneMobile | SpLigneFixe | SpInternet): SpSituationProposeeLigne => ({
    sp_sp_type: line.sp_type_ligne,
    sp_sp_nom: line.sp_nom_ligne,
    sp_sp_numero: line.sp_numero,
    sp_sp_quantite: line.sp_quantite,
    sp_sp_produit: line.sp_produit,
    sp_sp_fournisseur: line.sp_produit_fournisseur,
    sp_sp_prix_actuel: line.sp_prix_actuel,
    sp_sp_prix_propose: line.sp_prix_propose,
    sp_sp_economie: line.sp_economie,
    sp_sp_analyse: line.sp_analyse,
    _prix_raw: line._prix_propose_raw,
  });

  const toSituationMateriel = (m: SpMateriel): SpSituationProposeeLigne => ({
    sp_sp_type: 'Materiel',
    sp_sp_nom: m.sp_materiel_nom,
    sp_sp_produit: m.sp_materiel_nom,
    sp_sp_fournisseur: m.sp_materiel_fournisseur,
    sp_sp_prix_actuel: undefined,
    sp_sp_prix_propose: m.sp_materiel_prix_mensuel,
    sp_sp_economie: undefined,
    sp_sp_analyse: m.sp_materiel_commentaire,
    _prix_raw: m._prix_mensuel_raw,
  });

  const totalForfaits = toutes.reduce((sum, line) => sum + line._prix_propose_raw, 0);
  const totalMateriel = sp_materiel.reduce((sum, m) => sum + m._prix_mensuel_raw, 0);

  // Prix mensuel HT sans remise : prix catalogue × quantité (avant application des remises)
  const prixMensuelSansRemise = (l: SpLigneMobile | SpLigneFixe | SpInternet): number => {
    const quantite = parsePositiveQuantity(l.sp_quantite);
    const catalogueItem = findCatalogueMensuelProduit(catalogueMap, l.sp_produit_id, l.sp_produit);
    const originalUnitPrice = catalogueItem?.prix_mensuel ?? (l._prix_propose_raw / quantite);
    return originalUnitPrice * quantite;
  };

  // ── Reconstruire les tableaux BDC + cadeaux (même logique que generer-suggestions) ──
  const filteredBdcOperateurLines = orderProductBuckets(
    { internet: [], fixe: fixes, mobile: mobiles },
    spCategoriesOrder,
  ).filter((l) => {
    if (!l.sp_produit_id) return true;
    return catalogueMap.get(l.sp_produit_id)?.destinations?.bdc_operateur !== false;
  });
  const bdcOperateurOrder = getTableProductOrder(spTableProductOrders, 'sp_bdc_operateur_table');
  const bdcOperateurLines = orderProductsByPreference(
    filteredBdcOperateurLines,
    bdcOperateurOrder,
    (line) => line.sp_produit_id,
  );
  const bdcOperateurNumerosLines = orderProductsByPreference(
    filteredBdcOperateurLines,
    getTableProductOrder(spTableProductOrders, 'sp_bdc_operateur_numeros_table') ?? bdcOperateurOrder,
    (line) => line.sp_produit_id,
  );
  const toBdcOperateurLine = (
    l: SpLigneMobile | SpLigneFixe,
    includeNumber: boolean,
  ): SpBdcOperateurLigne => ({
    sp_bdc_op_type: l.sp_type_ligne,
    sp_bdc_op_nom: includeNumber
      ? formatBdcOperatorNameWithNumber(l.sp_nom_ligne, l.sp_numero)
      : l.sp_nom_ligne,
    sp_bdc_op_produit: l.sp_produit,
    sp_bdc_op_fournisseur: l.sp_produit_fournisseur,
    sp_bdc_op_quantite: l.sp_quantite?.trim() || '1',
    sp_bdc_op_prix_mensuel_ht: l.sp_prix_propose,
    sp_bdc_op_prix_mensuel_ht_sans_remise: formatEuro(prixMensuelSansRemise(l)),
    sp_bdc_op_prix_actuel: l.sp_prix_actuel,
    sp_bdc_op_economie: l.sp_economie,
    _prix_mensuel_raw: l._prix_propose_raw,
  });
  const sp_bdc_operateur_table = bdcOperateurLines.map((line) => toBdcOperateurLine(line, false));
  const sp_bdc_operateur_numeros_table = bdcOperateurNumerosLines.map((line) => toBdcOperateurLine(line, true));

  const bdcInternetLines = orderProductsByPreference(
    internet.filter((l) => {
      if (!l.sp_produit_id) return true;
      return catalogueMap.get(l.sp_produit_id)?.destinations?.bdc_operateur !== false;
    }),
    getTableProductOrder(spTableProductOrders, 'sp_bdc_internet_table'),
    (line) => line.sp_produit_id,
  );
  const sp_bdc_internet_table: SpBdcInternetLigne[] = bdcInternetLines
    .map((l): SpBdcInternetLigne => ({
      sp_bdc_int_nom: l.sp_nom_ligne,
      sp_bdc_int_produit: l.sp_produit,
      sp_bdc_int_fournisseur: l.sp_produit_fournisseur,
      sp_bdc_int_quantite: l.sp_quantite?.trim() || '1',
      sp_bdc_int_prix_mensuel_ht: l.sp_prix_propose,
      sp_bdc_int_prix_mensuel_ht_sans_remise: formatEuro(prixMensuelSansRemise(l)),
      sp_bdc_int_prix_actuel: l.sp_prix_actuel,
      _prix_mensuel_raw: l._prix_propose_raw,
    }));

  const bdcMaterielLines = orderProductsByPreference(
    sp_materiel.filter((m) => {
      if (!m.sp_materiel_produit_id) return true;
      return catalogueMap.get(m.sp_materiel_produit_id)?.destinations?.bdc_materiel !== false;
    }),
    getTableProductOrder(spTableProductOrders, 'sp_bdc_materiel_table'),
    (line) => line.sp_materiel_produit_id,
  );
  const sp_bdc_materiel_table: SpBdcMaterielLigne[] = bdcMaterielLines
    .map((m): SpBdcMaterielLigne => {
      const cat = m.sp_materiel_produit_id ? catalogueMap.get(m.sp_materiel_produit_id) : undefined;
      const freq = cat?.type_frequence ?? 'mensuel';
      return {
        sp_bdc_mat_nom: m.sp_materiel_nom,
        sp_bdc_mat_ref: m.sp_materiel_ref,
        sp_bdc_mat_fournisseur: m.sp_materiel_fournisseur,
        sp_bdc_mat_quantite: '1',
        sp_bdc_mat_prix_ht: m.sp_materiel_prix_mensuel,
        sp_bdc_mat_frequence: freq === 'unique' ? 'Achat unique' : 'Mensuel',
        _prix_raw: m._prix_mensuel_raw,
      };
    });

  const cadeauCartLines = cart.lines.filter((line) => line.categorie === 'cadeau');
  const sp_cadeaux_table: SpCadeauLigne[] = cadeauCartLines.length > 0
    ? cadeauCartLines.map((line): SpCadeauLigne => ({
        sp_cadeau_nom: line.produitNom,
        sp_cadeau_ref: undefined,
        sp_cadeau_quantite: String(line.quantite ?? 1),
        sp_cadeau_valeur_ht: formatEuro(line.prixTotal),
        _valeur_raw: line.prixTotal,
        _libre: !line.produitId,
      }))
    : (sp.sp_cadeaux_table ?? []);

  const totalBdcOp = sp_bdc_operateur_table.reduce((s, l) => s + l._prix_mensuel_raw, 0);
  const totalBdcInt = sp_bdc_internet_table.reduce((s, l) => s + l._prix_mensuel_raw, 0);
  const totalBdcMat = sp_bdc_materiel_table.reduce((s, l) => s + l._prix_raw, 0);
  const totalCadeaux = sp_cadeaux_table.reduce((s, l) => s + l._valeur_raw, 0);
  const remiseBreakdown = buildRemiseBreakdown(toutes, catalogueMap);
  const situationForfaitsLines = orderProductsByPreference(
    toutes,
    getTableProductOrder(spTableProductOrders, 'sp_situation_proposee_forfaits'),
    (line) => line.sp_produit_id,
  );
  const situationCompletLines = orderProductsByPreference(
    [...toutes, ...sp_materiel],
    getTableProductOrder(spTableProductOrders, 'sp_situation_proposee_complet'),
    (line) => 'sp_materiel_nom' in line ? line.sp_materiel_produit_id : line.sp_produit_id,
  );

  const repaired: SuggestionsSpCompletes = {
    ...sp,
    sp_lignes_mobiles: mobiles,
    sp_lignes_fixes: fixes,
    sp_internet: internet,
    sp_fixes_mobiles: orderProductBuckets(
      { internet: [], fixe: fixes, mobile: mobiles },
      spCategoriesOrder,
    ),
    sp_fixes_mobiles_internet: toutes,
    sp_toutes_lignes: toutes,
    sp_materiel,
    sp_materiel_detail,
    sp_situation_proposee_forfaits: situationForfaitsLines.map(toSituationLigne),
    sp_situation_proposee_forfaits_sans_remise: buildForfaitsSansRemiseTable(toutes, catalogueMap),
    sp_situation_proposee_complet: situationCompletLines.map((line) =>
      'sp_materiel_nom' in line ? toSituationMateriel(line) : toSituationLigne(line)
    ),
    sp_bdc_operateur_table,
    sp_bdc_operateur_numeros_table,
    sp_bdc_internet_table,
    sp_bdc_materiel_table,
    sp_cadeaux_table,
    sp_total_forfaits_mensuel_ht: formatEuro(totalForfaits),
    sp_total_materiel_ht: formatEuro(totalMateriel),
    sp_total_complet: formatEuro(totalForfaits + totalMateriel),
    sp_total_bdc_operateur_ht: formatEuro(totalBdcOp),
    sp_total_bdc_internet_ht: formatEuro(totalBdcInt),
    sp_total_bdc_materiel_ht: formatEuro(totalBdcMat),
    sp_total_cadeaux_ht: formatEuro(totalCadeaux),
    sp_total_recurrent: formatEuro(cart.abonnements.totalMensuel),
    sp_total_ponctuel: formatEuro(cart.totalPonctuel),
    sp_total_mensuel_final: formatEuro(cart.totalMensuelFinal),
    sp_total_indemnites: cart.indemnites > 0 ? formatEuro(cart.indemnites) : sp.sp_total_indemnites,
    sp_remise_mois_offert: cart.remiseMoisOffert > 0 ? formatEuro(cart.remiseMoisOffert) : sp.sp_remise_mois_offert,
    sp_total_remise: remiseBreakdown.total > 0.005 ? formatEuro(-remiseBreakdown.total) : sp.sp_total_remise,
    sp_remise_fixe: remiseBreakdown.fixe > 0.005 ? formatEuro(-remiseBreakdown.fixe) : sp.sp_remise_fixe,
    sp_remise_mobile: remiseBreakdown.mobile > 0.005 ? formatEuro(-remiseBreakdown.mobile) : sp.sp_remise_mobile,
    sp_remise_abonnement: (remiseBreakdown.fixe + remiseBreakdown.mobile) > 0.005 ? formatEuro(-(remiseBreakdown.fixe + remiseBreakdown.mobile)) : sp.sp_remise_abonnement,
    sp_remise_internet: remiseBreakdown.internet > 0.005 ? formatEuro(-remiseBreakdown.internet) : sp.sp_remise_internet,
    sp_marge: cart.marge > 0 ? formatEuro(cart.marge) : sp.sp_marge,
    ...(cart.loyer ? {
      sp_loyer_mensuel: formatEuro(cart.loyer.loyer_mensuel),
      sp_loyer_trimestriel: formatEuro(cart.loyer.loyer_trimestriel),
      sp_duree_mois: cart.loyer.duree_mois,
      sp_trimestres: cart.loyer.trimestres,
      sp_mois_offerts: cart.loyer.mois_offerts,
    } : {}),
  };

  return repaired;
}
