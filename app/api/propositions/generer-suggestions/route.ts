import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SuggestionsSpCompletes, SpLigneMobile, SpLigneFixe, SpInternet, SpMateriel, SpQuestionReponse, SpAdresse, WordConfig, CatalogueProduit, SpBareme, SpTauxDuree, SpSituationProposeeLigne, SpMaterielDetail, SpBdcOperateurLigne, SpBdcInternetLigne, SpBdcMaterielLigne, SpCadeauLigne, SpQuestion, SpConfigResiliation, SpProduitLibre, SpConfigMoisOfferts } from '@/types';
import { calculerLoyer, calculerRemiseMoisOffert } from '@/lib/sp/calculLoyer';
import { findApplicableBareme } from '@/lib/sp/evaluateBareme';
import { collectQuestionVariableValues } from '@/lib/sp/questionVariables';
import { estimateResiliationFromSA } from '@/lib/sp/resiliation';
import { calculateCartSummary, type CartLine } from '@/lib/sp/calculateCart';

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function buildPriceOverridesMap(spReponses: SpQuestionReponse[]): Map<string, number> {
  const overrides = new Map<string, number>();

  for (const reponse of spReponses) {
    if (!reponse.question_id.startsWith('prix_')) continue;

    if (typeof reponse.valeur === 'string') {
      try {
        const parsed = JSON.parse(reponse.valeur);
        if (isPlainObject(parsed)) {
          for (const [productName, value] of Object.entries(parsed)) {
            const price = parseFloat(String(value));
            if (productName.trim() && Number.isFinite(price)) {
              overrides.set(productName.trim().toLowerCase(), price);
            }
          }
          continue;
        }
      } catch {
        // Single product price override, handled below.
      }

      const questionId = reponse.question_id.replace(/^prix_/, '');
      const selectedProduct = spReponses.find((r) => r.question_id === questionId);
      const selectedName = typeof selectedProduct?.valeur === 'string' ? selectedProduct.valeur.trim() : '';
      const price = parseFloat(reponse.valeur);
      if (selectedName && Number.isFinite(price)) {
        overrides.set(selectedName.toLowerCase(), price);
      }
    }
  }

  return overrides;
}

function getPriceOverride(
  priceOverrides: Map<string, number>,
  produitId?: string,
  produitNom?: string,
): number | null {
  if (produitNom) {
    const byName = priceOverrides.get(produitNom.trim().toLowerCase());
    if (byName != null && Number.isFinite(byName)) return byName;
  }
  if (produitId) {
    const byId = priceOverrides.get(produitId.trim().toLowerCase());
    if (byId != null && Number.isFinite(byId)) return byId;
  }
  return null;
}

function sanitizeLineNumber(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const firstDigitIndex = trimmed.search(/\d/);
  if (firstDigitIndex < 0) return undefined;

  const digitCount = trimmed.replace(/\D/g, '').length;
  if (digitCount < 8) return undefined;

  const withoutLeadingText = trimmed.slice(firstDigitIndex);
  const withoutParentheses = withoutLeadingText.replace(/\([^)]*\)/g, ' ');
  const cleaned = withoutParentheses
    .replace(/[A-Za-zÀ-ÿ]+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || undefined;
}

function extractLineNumber(line: UnknownRecord): string | undefined {
  const candidates = [
    line.sp_numero,
    line.numero_ligne,
    line.numero,
    line.telephone,
    line.tel,
    line.reference_contrat,
  ];
  for (const candidate of candidates) {
    const sanitized = sanitizeLineNumber(candidate);
    if (sanitized) return sanitized;
  }
  return undefined;
}

function inferSuggestedLineType(line: UnknownRecord): 'Mobile' | 'Fixe' | 'Internet' | undefined {
  const rawType = typeof line.type === 'string'
    ? line.type
    : typeof line.sp_type_ligne === 'string'
      ? line.sp_type_ligne
      : typeof line.categorie === 'string'
        ? line.categorie
        : '';
  const normalized = rawType.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes('mobile')) return 'Mobile';
  if (normalized.includes('fixe')) return 'Fixe';
  if (normalized.includes('internet') || normalized.includes('fibre') || normalized.includes('data')) return 'Internet';
  return undefined;
}

function parseJsonRecord(value: unknown): Record<string, string> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = String(v);
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function getQuantityOverride(
  reponses: SpQuestionReponse[],
  instanceId: string,
  produitNom?: string,
  produitId?: string,
): string | undefined {
  const rep = reponses.find((r) => r.question_id === `quantite_${instanceId}`);
  if (!rep) return undefined;
  const asMap = parseJsonRecord(rep.valeur);
  if (asMap) {
    const candidates = [produitId, produitNom].filter((value): value is string => !!value?.trim());
    for (const key of candidates) {
      const quantity = asMap[key];
      if (quantity && quantity.trim()) return quantity.trim();
    }
    return undefined;
  }
  if (typeof rep.valeur === 'string' && rep.valeur.trim()) return rep.valeur.trim();
  if (typeof rep.valeur === 'number' && Number.isFinite(rep.valeur)) return String(rep.valeur);
  return undefined;
}

function getQuantityByProduct(
  reponses: SpQuestionReponse[],
  produitNom?: string,
  produitId?: string,
): string | undefined {
  const candidates = [produitId, produitNom]
    .filter((value): value is string => !!value?.trim())
    .map((value) => value.trim());
  if (candidates.length === 0) return undefined;

  const matches = new Set<string>();
  for (const reponse of reponses) {
    if (!reponse.question_id.startsWith('quantite_')) continue;
    const asMap = parseJsonRecord(reponse.valeur);
    if (!asMap) continue;
    for (const key of candidates) {
      const quantity = asMap[key];
      if (quantity && quantity.trim()) matches.add(quantity.trim());
    }
  }

  return matches.size === 1 ? Array.from(matches)[0] : undefined;
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function normalizeResiliationAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

type SpLigneBaseRaw = Omit<SpLigneMobile, 'sp_type_ligne'>;

function buildSpLigne(raw: UnknownRecord, priceOverrides: Map<string, number>): SpLigneBaseRaw {
  const prixActuel = typeof raw._prix_actuel_raw === 'number' ? raw._prix_actuel_raw : 0;
  const overriddenPrice = getPriceOverride(
    priceOverrides,
    typeof raw.sp_produit_id === 'string' ? raw.sp_produit_id : undefined,
    typeof raw.sp_produit === 'string' ? raw.sp_produit : undefined,
  );
  const prixPropose = overriddenPrice ?? (typeof raw._prix_propose_raw === 'number' ? raw._prix_propose_raw : prixActuel);
  const economie = prixActuel - prixPropose;
  return {
    sp_nom_ligne: String(raw.sp_nom_ligne ?? ''),
    sp_numero: extractLineNumber(raw),
    sp_quantite: typeof raw.sp_quantite === 'string' && raw.sp_quantite.trim() ? raw.sp_quantite.trim() : undefined,
    sp_produit: String(raw.sp_produit ?? 'Aucun produit semblable trouvé'),
    sp_produit_id: typeof raw.sp_produit_id === 'string' ? raw.sp_produit_id : undefined,
    sp_produit_fournisseur: typeof raw.sp_produit_fournisseur === 'string' ? raw.sp_produit_fournisseur : undefined,
    sp_prix_actuel: formatEuro(prixActuel),
    sp_prix_propose: formatEuro(prixPropose),
    sp_economie: formatEuro(economie),
    sp_analyse: String(raw.sp_analyse ?? ''),
    sp_justification: String(raw.sp_justification ?? ''),
    _prix_actuel_raw: prixActuel,
    _prix_propose_raw: prixPropose,
    _economie_raw: economie,
  };
}

function buildSpMateriel(raw: UnknownRecord, priceOverrides: Map<string, number>): SpMateriel {
  const overriddenPrice = getPriceOverride(
    priceOverrides,
    typeof raw.sp_materiel_produit_id === 'string' ? raw.sp_materiel_produit_id : undefined,
    typeof raw.sp_materiel_nom === 'string' ? raw.sp_materiel_nom : undefined,
  );
  const prix = overriddenPrice ?? (typeof raw._prix_mensuel_raw === 'number' ? raw._prix_mensuel_raw : 0);
  return {
    sp_materiel_nom: String(raw.sp_materiel_nom ?? ''),
    sp_materiel_ref: typeof raw.sp_materiel_ref === 'string' ? raw.sp_materiel_ref : undefined,
    sp_materiel_prix_mensuel: formatEuro(prix),
    sp_materiel_duree_engagement: String(raw.sp_materiel_duree_engagement ?? ''),
    sp_materiel_commentaire: String(raw.sp_materiel_commentaire ?? ''),
    sp_materiel_produit_id: typeof raw.sp_materiel_produit_id === 'string' ? raw.sp_materiel_produit_id : undefined,
    sp_materiel_fournisseur: typeof raw.sp_materiel_fournisseur === 'string' ? raw.sp_materiel_fournisseur : undefined,
    sp_type_ligne: 'Materiel',
    _prix_mensuel_raw: prix,
  };
}

const FREE_ENTRY_MARKER = '__libre__';

function parseLibreFromRaw(raw: UnknownRecord): SpProduitLibre[] {
  const reponses = Array.isArray(raw.sp_questions_reponses)
    ? (raw.sp_questions_reponses as SpQuestionReponse[])
    : [];
  const out: SpProduitLibre[] = [];
  for (const r of reponses) {
    if (!r.question_id.startsWith('libre_')) continue;
    if (typeof r.valeur !== 'string') continue;
    try {
      const parsed = JSON.parse(r.valeur) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof (parsed as Record<string, unknown>).label === 'string' &&
        typeof (parsed as Record<string, unknown>).prix === 'number' &&
        typeof (parsed as Record<string, unknown>).categorie === 'string'
      ) {
        out.push(parsed as SpProduitLibre);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

function buildSpMaterielFromLibre(produit: SpProduitLibre): SpMateriel {
  return {
    sp_materiel_nom: produit.label,
    sp_materiel_prix_mensuel: `${produit.prix.toFixed(2).replace('.', ',')} €`,
    sp_materiel_duree_engagement: '',
    sp_materiel_commentaire: 'Saisie libre',
    sp_materiel_produit_id: FREE_ENTRY_MARKER,
    sp_type_ligne: 'Materiel',
    _prix_mensuel_raw: produit.prix,
  };
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

type SuggestionResult = {
  suggestions: Array<{
    ligne_actuelle: UnknownRecord;
    produit_propose_id?: string;
    produit_propose_nom: string;
    produit_propose_fournisseur?: string;
    prix_actuel: number;
    prix_propose: number;
    economie_mensuelle: number;
    justification: string;
  }>;
  synthese: {
    cout_total_actuel: number;
    cout_total_propose: number;
    economie_mensuelle: number;
    economie_annuelle: number;
    ameliorations?: string[];
  };
};

function buildSpCompletes(
  raw: UnknownRecord,
  baseResult: SuggestionResult,
  adresseFacturation: SpAdresse | undefined,
  adresseLivraison: SpAdresse | null | undefined,
  livraisonIdentique: boolean,
  wordCfg: WordConfig,
  templateQuestions: SpQuestion[],
  catalogueProduits?: CatalogueProduit[],
  loyerBaremes?: SpBareme[],
  priceOverrides: Map<string, number> = new Map(),
  fasTotal = 0,
  loyerDureeConfig?: { depends_question?: boolean; question_id?: string; defaut?: number },
  spConfigMoisOfferts?: SpConfigMoisOfferts,
): SuggestionsSpCompletes {
  const rawMobiles = Array.isArray(raw.sp_lignes_mobiles) ? raw.sp_lignes_mobiles as UnknownRecord[] : [];
  const rawFixes = Array.isArray(raw.sp_lignes_fixes) ? raw.sp_lignes_fixes as UnknownRecord[] : [];
  const rawInternet = Array.isArray(raw.sp_internet) ? raw.sp_internet as UnknownRecord[] : [];
  const rawMateriel = Array.isArray(raw.sp_materiel) ? raw.sp_materiel as UnknownRecord[] : [];
  const reponses = Array.isArray(raw.sp_questions_reponses)
    ? (raw.sp_questions_reponses as SpQuestionReponse[])
    : [];

  const linesByType = {
    Mobile: [] as UnknownRecord[],
    Fixe: [] as UnknownRecord[],
    Internet: [] as UnknownRecord[],
  };
  for (const suggestion of baseResult.suggestions) {
    const line = isPlainObject(suggestion.ligne_actuelle) ? suggestion.ligne_actuelle as UnknownRecord : undefined;
    if (!line) continue;
    const type = inferSuggestedLineType(line);
    if (!type) continue;
    linesByType[type].push(line);
  }
  const withFallbackSelectionData = (
    entries: UnknownRecord[],
    fallbackLines: UnknownRecord[],
  ): UnknownRecord[] => entries.map((entry, index) => {
    const fallback = fallbackLines[index] ?? {};
    return {
      ...entry,
      sp_numero: extractLineNumber(entry) ?? extractLineNumber(fallback),
      sp_quantite:
        (typeof entry.sp_quantite === 'string' && entry.sp_quantite.trim() ? entry.sp_quantite.trim() : undefined)
        ?? (typeof fallback.quantite === 'string' && fallback.quantite.trim() ? fallback.quantite.trim() : undefined)
        ?? (typeof fallback.quantite === 'number' && Number.isFinite(fallback.quantite) ? String(fallback.quantite) : undefined)
        ?? getQuantityByProduct(
          reponses,
          typeof entry.sp_produit === 'string' ? entry.sp_produit : undefined,
          typeof entry.sp_produit_id === 'string' ? entry.sp_produit_id : undefined,
        ),
    };
  });

  const rawMobilesWithNumero = withFallbackSelectionData(rawMobiles, linesByType.Mobile);
  const rawFixesWithNumero = withFallbackSelectionData(rawFixes, linesByType.Fixe);
  const rawInternetWithNumero = withFallbackSelectionData(rawInternet, linesByType.Internet);

  const sp_lignes_mobiles: SpLigneMobile[] = rawMobilesWithNumero.map((r) => ({ ...buildSpLigne(r, priceOverrides), sp_type_ligne: 'Mobile' as const }));
  const sp_lignes_fixes: SpLigneFixe[] = rawFixesWithNumero.map((r) => ({ ...buildSpLigne(r, priceOverrides), sp_type_ligne: 'Fixe' as const }));
  const sp_internet: SpInternet[] = rawInternetWithNumero.map((r) => ({ ...buildSpLigne(r, priceOverrides), sp_type_ligne: 'Internet' as const }));
  const sp_materiel: SpMateriel[] = rawMateriel.map((r) => buildSpMateriel(r, priceOverrides));

  const catalogueMap = new Map<string, CatalogueProduit>();
  if (catalogueProduits) {
    for (const p of catalogueProduits) catalogueMap.set(p.id, p);
  }

  if (templateQuestions.length > 0 && catalogueProduits && catalogueProduits.length > 0) {
    const questionnaireCart = calculateCartSummary(reponses, templateQuestions, catalogueProduits, {});
    const mobileCartLines = questionnaireCart.lines.filter((line) => line.type_frequence === 'mensuel' && line.categorie === 'mobile');
    const fixeCartLines = questionnaireCart.lines.filter((line) => line.type_frequence === 'mensuel' && line.categorie === 'fixe');
    const internetCartLines = questionnaireCart.lines.filter((line) => line.type_frequence === 'mensuel' && line.categorie === 'internet');
    const hasTelecomSelections = mobileCartLines.length > 0 || fixeCartLines.length > 0 || internetCartLines.length > 0;

    if (hasTelecomSelections) {
      sp_lignes_mobiles.splice(0, sp_lignes_mobiles.length, ...(mobileCartLines.length > 0 ? rebuildTelecomLinesFromQuestionnaire(sp_lignes_mobiles, mobileCartLines, 'Mobile', catalogueMap) : []));
      sp_lignes_fixes.splice(0, sp_lignes_fixes.length, ...(fixeCartLines.length > 0 ? rebuildTelecomLinesFromQuestionnaire(sp_lignes_fixes, fixeCartLines, 'Fixe', catalogueMap) : []));
      sp_internet.splice(0, sp_internet.length, ...(internetCartLines.length > 0 ? rebuildTelecomLinesFromQuestionnaire(sp_internet, internetCartLines, 'Internet', catalogueMap) : []));
    }

  }

  // ── Inject saisies libres ("Autre valeur") ────────────────────────────
  const libreProduits = parseLibreFromRaw(raw);
  const libreByNom = new Map<string, SpProduitLibre>();
  for (const lp of libreProduits) {
    libreByNom.set(lp.label, lp);
    sp_materiel.push(buildSpMaterielFromLibre(lp));
  }

  const toutes = [...sp_lignes_mobiles, ...sp_lignes_fixes, ...sp_internet];
  const economieTotale = toutes.reduce((s, l) => s + l._economie_raw, 0);
  const totalActuel = toutes.reduce((s, l) => s + l._prix_actuel_raw, 0);
  const totalPropose = toutes.reduce((s, l) => s + l._prix_propose_raw, 0);

  // ── Récurrent / Ponctuel breakdown via catalogue type_frequence ──
  // Lines (mobiles/fixes/internet) are always recurrent (monthly)
  const totalRecurrentLignes = totalPropose;

  // Material: split by type_frequence
  let totalMaterielRecurrent = 0;
  let totalMaterielPonctuel = 0;
  for (const m of sp_materiel) {
    const isLibre = m.sp_materiel_produit_id === FREE_ENTRY_MARKER;
    const catalogueItem = !isLibre && m.sp_materiel_produit_id ? catalogueMap.get(m.sp_materiel_produit_id) : undefined;
    const freq = isLibre ? 'unique' : (catalogueItem?.type_frequence ?? 'mensuel');
    if (freq === 'unique') {
      totalMaterielPonctuel += m._prix_mensuel_raw; // one-time cost
    } else {
      totalMaterielRecurrent += m._prix_mensuel_raw;
    }
  }

  const totalRecurrent = totalRecurrentLignes + totalMaterielRecurrent;
  const totalPonctuel = totalMaterielPonctuel;
  const categoriesMoisOfferts = spConfigMoisOfferts?.categories_inclues ?? ['fixe', 'mobile'];
  const totalFixeMoisOfferts = sp_lignes_fixes.reduce((s, l) => s + l._prix_propose_raw, 0);
  const totalMobileMoisOfferts = sp_lignes_mobiles.reduce((s, l) => s + l._prix_propose_raw, 0);
  const totalInternetMoisOfferts = sp_internet.reduce((s, l) => s + l._prix_propose_raw, 0);
  let totalRecurrentMoisOfferts = 0;
  if (categoriesMoisOfferts.includes('fixe')) totalRecurrentMoisOfferts += totalFixeMoisOfferts;
  if (categoriesMoisOfferts.includes('mobile')) totalRecurrentMoisOfferts += totalMobileMoisOfferts;
  if (categoriesMoisOfferts.includes('internet')) totalRecurrentMoisOfferts += totalInternetMoisOfferts;
  if (categoriesMoisOfferts.includes('autres_mensuels')) totalRecurrentMoisOfferts += totalMaterielRecurrent;

  // ── Loyer calculation ──
  // Résolution de la durée :
  //   1. Config "duree_depends_question" → réponse à la question SP désignée.
  //   2. Sinon : ancien mécanisme `raw.sp_duree_mois` (consequence renseigner_variable).
  //   3. Fallback : duree_mois_par_defaut configurée sur le template.
  let dureeMois = 0;
  if (loyerDureeConfig?.depends_question && loyerDureeConfig.question_id) {
    const targetId = loyerDureeConfig.question_id;
    const dureeRep = reponses.find(
      (r) => r.question_id === targetId || r.question_id.startsWith(`${targetId}__iter_`),
    );
    if (dureeRep) {
      const raw = Array.isArray(dureeRep.valeur) ? dureeRep.valeur[0] : dureeRep.valeur;
      const match = String(raw ?? '').match(/-?\d+(?:[.,]\d+)?/);
      const v = match ? Number(match[0].replace(',', '.')) : NaN;
      if (Number.isFinite(v) && v > 0) dureeMois = v;
    }
  }
  if (!dureeMois) {
    dureeMois = toNumber(raw.sp_duree_mois) ?? 0;
  }
  if (!dureeMois && loyerDureeConfig?.defaut && loyerDureeConfig.defaut > 0) {
    dureeMois = loyerDureeConfig.defaut;
  }
  const bareme = loyerBaremes ? findApplicableBareme(loyerBaremes, reponses, {}, catalogueProduits) : null;
  const margeRep = reponses.find((r) => r.question_id === 'sp_marge_calculee');
  const marge = margeRep ? (Number(margeRep.valeur) || 0) : 0;
  const remiseMoisOffert = dureeMois > 0 ? calculerRemiseMoisOffert(bareme, totalRecurrentMoisOfferts, dureeMois) : 0;
  // Indemnités : prioriser réponse SP, sinon raw.sp_total_indemnites
  let indemnitesNum = 0;
  const indemRep = reponses.find((r) => r.question_id === 'sp_total_indemnites');
  if (indemRep) {
    const rawIndem = Array.isArray(indemRep.valeur) ? indemRep.valeur[0] : indemRep.valeur;
    const m = String(rawIndem ?? '').match(/-?\d+(?:[.,]\d+)?/);
    indemnitesNum = m ? Number(m[0].replace(',', '.')) || 0 : 0;
  }
  if (!indemnitesNum && raw.sp_total_indemnites != null) {
    const m = String(raw.sp_total_indemnites).match(/-?\d+(?:[.,]\d+)?/);
    indemnitesNum = m ? Number(m[0].replace(',', '.')) || 0 : 0;
  }
  const baseLoyer = totalPonctuel + remiseMoisOffert + indemnitesNum + marge;
  const loyer = dureeMois > 0 ? calculerLoyer(bareme, baseLoyer, dureeMois) : null;

  const result: SuggestionsSpCompletes = {
    ...baseResult,
    sp_fournisseur_propose: typeof raw.sp_fournisseur_propose === 'string' ? raw.sp_fournisseur_propose : undefined,
    sp_adresse_facturation: adresseFacturation,
    sp_adresse_livraison: livraisonIdentique ? undefined : adresseLivraison,
    sp_livraison_identique: livraisonIdentique,
    sp_lignes_mobiles,
    sp_lignes_fixes,
    sp_internet,
    sp_materiel,
    sp_fixes_mobiles: [...sp_lignes_fixes, ...sp_lignes_mobiles],
    sp_fixes_mobiles_internet: [...sp_lignes_fixes, ...sp_lignes_mobiles, ...sp_internet],
    sp_toutes_lignes: toutes,
    sp_tout: [...toutes, ...sp_materiel],
    sp_economie_mensuelle: formatEuro(economieTotale),
    sp_economie_annuelle: formatEuro(economieTotale * 12),
    sp_total_actuel: formatEuro(totalActuel),
    sp_total_propose: formatEuro(totalPropose),
    sp_ameliorations: typeof raw.sp_ameliorations === 'string' ? raw.sp_ameliorations : '',
    sp_nb_lignes: String(toutes.length),
    sp_est_economie: economieTotale > 0 ? 'Oui' : 'Non',
    sp_taux_economie_pct: totalActuel > 0 ? Math.round((economieTotale / totalActuel) * 100 * 10) / 10 : 0,
    // Récurrent / Ponctuel
    sp_total_recurrent: formatEuro(totalRecurrent),
    sp_total_ponctuel: formatEuro(totalPonctuel),
    sp_remise_mois_offert: remiseMoisOffert > 0 ? formatEuro(remiseMoisOffert) : undefined,
    sp_fas_total: fasTotal > 0 ? formatEuro(fasTotal) : undefined,
    // Loyer
    ...(loyer ? {
      sp_loyer_mensuel: formatEuro(loyer.loyer_mensuel),
      sp_loyer_trimestriel: formatEuro(loyer.loyer_trimestriel),
      sp_marge: formatEuro(loyer.marge_appliquee),
      sp_duree_mois: loyer.duree_mois,
      sp_trimestres: loyer.trimestres,
      sp_mois_offerts: loyer.mois_offerts,
    } : {}),
  };

  if (wordCfg.spTableauxFusionnes) {
    for (const fusion of wordCfg.spTableauxFusionnes) {
      const items: unknown[] = [];
      const map: Record<string, unknown[]> = {
        mobiles: sp_lignes_mobiles,
        fixes: sp_lignes_fixes,
        internet: sp_internet,
        materiel: sp_materiel,
      };
      for (const cat of fusion.categories) {
        items.push(...(map[cat] ?? []));
      }
      result[fusion.id] = items;
    }
  }

  // ── Lot 4: Tables filtrées ─────────────────────────────────────────────

  // Helper: convert a ligne (mobile/fixe/internet) to SpSituationProposeeLigne
  const toSituationLigne = (l: SpLigneMobile | SpLigneFixe | SpInternet): SpSituationProposeeLigne => ({
    sp_sp_type: l.sp_type_ligne,
    sp_sp_nom: l.sp_nom_ligne,
    sp_sp_numero: l.sp_numero,
    sp_sp_quantite: l.sp_quantite,
    sp_sp_produit: l.sp_produit,
    sp_sp_fournisseur: l.sp_produit_fournisseur,
    sp_sp_prix_actuel: l.sp_prix_actuel,
    sp_sp_prix_propose: l.sp_prix_propose,
    sp_sp_economie: l.sp_economie,
    sp_sp_analyse: l.sp_analyse,
    _prix_raw: l._prix_propose_raw,
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

  // sp_situation_proposee_forfaits: mobiles + fixes + internet
  result.sp_situation_proposee_forfaits = toutes.map(toSituationLigne);
  result.sp_situation_proposee_forfaits_sans_remise = buildForfaitsSansRemiseTable(toutes, catalogueMap);

  // sp_situation_proposee_complet: tout (forfaits + matériel)
  result.sp_situation_proposee_complet = [
    ...toutes.map(toSituationLigne),
    ...sp_materiel.map(toSituationMateriel),
  ];

  // sp_materiel_detail: matériel enrichi avec infos catalogue (hors cadeaux — ceux-ci vont dans sp_cadeaux_table)
  result.sp_materiel_detail = sp_materiel
    .filter((m) => {
      if (m.sp_materiel_produit_id === FREE_ENTRY_MARKER) return true;
      const cat = m.sp_materiel_produit_id ? catalogueMap.get(m.sp_materiel_produit_id) : undefined;
      return cat?.categorie !== 'cadeau';
    })
    .map((m): SpMaterielDetail => {
    const isLibre = m.sp_materiel_produit_id === FREE_ENTRY_MARKER;
    const cat = !isLibre && m.sp_materiel_produit_id ? catalogueMap.get(m.sp_materiel_produit_id) : undefined;
    const freq = isLibre ? 'unique' : (cat?.type_frequence ?? 'mensuel');
    const imageUrl = !isLibre && typeof cat?.image_url === 'string' ? cat.image_url : undefined;
    const description = !isLibre && typeof cat?.description === 'string' ? cat.description : '';
    return {
      sp_matd_nom: m.sp_materiel_nom,
      sp_matd_ref: m.sp_materiel_ref,
      sp_matd_fournisseur: m.sp_materiel_fournisseur,
      sp_matd_quantite: '1',
      sp_matd_prix_ht: m.sp_materiel_prix_mensuel,
      sp_matd_description: description,
      sp_matd_frequence: freq === 'unique' ? 'Achat unique' : 'Mensuel',
      sp_matd_image_url: imageUrl,
      sp_mat_image_url: imageUrl,
      _prix_raw: m._prix_mensuel_raw,
    };
  });

  // sp_bdc_operateur_table: forfaits (mobile/fixe) filtrés par destinations.bdc_operateur
  const sp_bdc_operateur_table: SpBdcOperateurLigne[] = [...sp_lignes_mobiles, ...sp_lignes_fixes]
    .filter((l) => {
      if (!l.sp_produit_id) return true; // pas de ref catalogue → inclure par défaut
      const cat = catalogueMap.get(l.sp_produit_id);
      return cat?.destinations?.bdc_operateur !== false;
    })
    .map((l): SpBdcOperateurLigne => ({
      sp_bdc_op_type: l.sp_type_ligne,
      sp_bdc_op_nom: l.sp_nom_ligne,
      sp_bdc_op_produit: l.sp_produit,
      sp_bdc_op_fournisseur: l.sp_produit_fournisseur,
      sp_bdc_op_prix_mensuel_ht: l.sp_prix_propose,
      sp_bdc_op_prix_actuel: l.sp_prix_actuel,
      sp_bdc_op_economie: l.sp_economie,
      _prix_mensuel_raw: l._prix_propose_raw,
    }));

  // sp_bdc_internet_table: internet filtré par destinations.bdc_operateur
  const sp_bdc_internet_table: SpBdcInternetLigne[] = sp_internet
    .filter((l) => {
      if (!l.sp_produit_id) return true;
      const cat = catalogueMap.get(l.sp_produit_id);
      return cat?.destinations?.bdc_operateur !== false;
    })
    .map((l): SpBdcInternetLigne => ({
      sp_bdc_int_nom: l.sp_nom_ligne,
      sp_bdc_int_produit: l.sp_produit,
      sp_bdc_int_fournisseur: l.sp_produit_fournisseur,
      sp_bdc_int_prix_mensuel_ht: l.sp_prix_propose,
      sp_bdc_int_prix_actuel: l.sp_prix_actuel,
      _prix_mensuel_raw: l._prix_propose_raw,
    }));

  // sp_bdc_materiel_table: matériel filtré par destinations.bdc_materiel
  const sp_bdc_materiel_table: SpBdcMaterielLigne[] = sp_materiel
    .filter((m) => {
      if (!m.sp_materiel_produit_id) return true;
      if (m.sp_materiel_produit_id === FREE_ENTRY_MARKER) return true;
      const cat = catalogueMap.get(m.sp_materiel_produit_id);
      return cat?.destinations?.bdc_materiel !== false;
    })
    .map((m): SpBdcMaterielLigne => {
      const isLibre = m.sp_materiel_produit_id === FREE_ENTRY_MARKER;
      const cat = !isLibre && m.sp_materiel_produit_id ? catalogueMap.get(m.sp_materiel_produit_id) : undefined;
      const freq = isLibre ? 'unique' : (cat?.type_frequence ?? 'mensuel');
      return {
        sp_bdc_mat_nom: m.sp_materiel_nom,
        sp_bdc_mat_ref: m.sp_materiel_ref,
        sp_bdc_mat_fournisseur: m.sp_materiel_fournisseur,
        sp_bdc_mat_prix_ht: m.sp_materiel_prix_mensuel,
        sp_bdc_mat_frequence: freq === 'unique' ? 'Achat unique' : 'Mensuel',
        _prix_raw: m._prix_mensuel_raw,
      };
    });

  // sp_cadeaux_table: produits avec categorie === 'cadeau' (ajoutés via sp_materiel)
  const sp_cadeaux_table: SpCadeauLigne[] = sp_materiel
    .filter((m) => {
      if (m.sp_materiel_produit_id === FREE_ENTRY_MARKER) {
        return libreByNom.get(m.sp_materiel_nom)?.categorie === 'cadeau';
      }
      if (!m.sp_materiel_produit_id) return false;
      const cat = catalogueMap.get(m.sp_materiel_produit_id);
      return cat?.categorie === 'cadeau';
    })
    .map((m): SpCadeauLigne => ({
      sp_cadeau_nom: m.sp_materiel_nom,
      sp_cadeau_ref: m.sp_materiel_ref,
      sp_cadeau_valeur_ht: m.sp_materiel_prix_mensuel,
      _valeur_raw: m._prix_mensuel_raw,
    }));

  result.sp_bdc_operateur_table = sp_bdc_operateur_table;
  result.sp_bdc_internet_table = sp_bdc_internet_table;
  result.sp_bdc_materiel_table = sp_bdc_materiel_table;
  result.sp_cadeaux_table = sp_cadeaux_table;

  // ── Lot 4: Variables simples ────────────────────────────────────────────

  // sp_date_limite_souscription: cherche dans les réponses SP
  const dateLimiteRep = reponses.find((r) => r.question_id === 'sp_date_limite_souscription');
  if (dateLimiteRep && dateLimiteRep.valeur) {
    result.sp_date_limite_souscription = String(dateLimiteRep.valeur);
  }

  // sp_duree_trimestres: même valeur que sp_trimestres mais formatée en chaîne
  if (loyer) {
    result.sp_duree_trimestres = String(loyer.trimestres);
  }

  // Totaux des tables filtrées
  const totalForfaits = toutes.reduce((s, l) => s + l._prix_propose_raw, 0);
  const totalMaterielHt = sp_materiel.reduce((s, m) => s + m._prix_mensuel_raw, 0);
  const totalBdcOp = sp_bdc_operateur_table.reduce((s, l) => s + l._prix_mensuel_raw, 0);
  const totalBdcInt = sp_bdc_internet_table.reduce((s, l) => s + l._prix_mensuel_raw, 0);
  const totalBdcMat = sp_bdc_materiel_table.reduce((s, l) => s + l._prix_raw, 0);
  const totalCadeaux = sp_cadeaux_table.reduce((s, l) => s + l._valeur_raw, 0);

  result.sp_total_forfaits_mensuel_ht = formatEuro(totalForfaits);
  result.sp_total_materiel_ht = formatEuro(totalMaterielHt);
  result.sp_total_bdc_operateur_ht = formatEuro(totalBdcOp);
  result.sp_total_bdc_internet_ht = formatEuro(totalBdcInt);
  result.sp_total_bdc_materiel_ht = formatEuro(totalBdcMat);
  result.sp_total_cadeaux_ht = formatEuro(totalCadeaux);
  result.sp_total_complet = formatEuro(totalForfaits + totalMaterielHt);

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      situation_actuelle,
      catalogue,
      preferences,
      proposition_id,
      sp_questions_reponses,
      force_regenerate,
      sp_fas_total,
    } = body ?? {};

    const adresse_facturation: SpAdresse | undefined = isPlainObject(preferences) && isPlainObject(preferences.adresse_facturation) ? preferences.adresse_facturation as unknown as SpAdresse : undefined;
    const adresse_livraison: SpAdresse | null | undefined = isPlainObject(preferences) ? (isPlainObject(preferences.adresse_livraison) ? preferences.adresse_livraison as unknown as SpAdresse : null) : undefined;
    const livraison_identique: boolean = isPlainObject(preferences) && preferences.livraison_identique === true;
    const spReponses: SpQuestionReponse[] = Array.isArray(sp_questions_reponses) ? sp_questions_reponses as SpQuestionReponse[] : [];

    if (typeof proposition_id === 'string' && proposition_id.length > 0) {
      const { data: proposition, error: propError } = await supabase
        .from('propositions')
        .select('id, suggestions_sp_completes')
        .eq('id', proposition_id)
        .eq('organization_id', user.id)
        .single();

      if (propError || !proposition) {
        return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
      }

      if (proposition.suggestions_sp_completes && !force_regenerate) {
        return NextResponse.json(proposition.suggestions_sp_completes);
      }
    }

    if (!Array.isArray(catalogue)) {
      return NextResponse.json({ error: 'catalogue invalide' }, { status: 400 });
    }

    const priceOverrides = buildPriceOverridesMap(spReponses);

    const rawResult: UnknownRecord = {
      sp_lignes_mobiles: [],
      sp_lignes_fixes: [],
      sp_internet: [],
      sp_materiel: [],
      sp_questions_reponses: spReponses,
    };

    const emptyBaseResult: SuggestionResult = {
      suggestions: [],
      synthese: {
        cout_total_actuel: 0,
        cout_total_propose: 0,
        economie_mensuelle: 0,
        economie_annuelle: 0,
      },
    };

    let wordCfg: WordConfig = { formatVariables: '', fieldMappings: {} };
    let templateQuestions: SpQuestion[] = [];
    let resiliationConfig: SpConfigResiliation | undefined;
    let propositionCreatedAt: string | undefined;
    if (typeof proposition_id === 'string' && proposition_id.length > 0) {
      const { data: prop } = await supabase
        .from('propositions')
        .select('template_id, created_at')
        .eq('id', proposition_id)
        .single();
      propositionCreatedAt = typeof prop?.created_at === 'string' ? prop.created_at : undefined;
      if (prop?.template_id) {
        const [{ data: tmpl }, { data: org }] = await Promise.all([
          supabase
            .from('proposition_templates')
            .select('file_config')
            .eq('id', prop.template_id)
            .single(),
          supabase
            .from('organizations')
            .select('preferences, sp_questions')
            .eq('id', user.id)
            .single(),
        ]);
        if (isPlainObject(tmpl?.file_config)) {
          wordCfg = tmpl.file_config as unknown as WordConfig;
        }
        if (Array.isArray(org?.sp_questions)) {
          templateQuestions = (org.sp_questions as SpQuestion[])
            .filter((question) => question.template_id === prop.template_id);
        }
        const orgPreferences = isPlainObject(org?.preferences)
          ? (org.preferences as UnknownRecord)
          : undefined;
        resiliationConfig = wordCfg.sp_config_resiliation
          ?? (orgPreferences?.sp_config_resiliation as SpConfigResiliation | undefined);
      }
    }

    // Load loyer baremes: template file_config first, org preferences as fallback
    let loyerBaremes: SpBareme[] | undefined;
    let loyerDureeConfig: { depends_question?: boolean; question_id?: string; defaut?: number } | undefined;
    let spConfigMoisOfferts: SpConfigMoisOfferts | undefined;

    const tmplCfg = wordCfg as WordConfig & {
      sp_config_loyer?: {
        baremes?: SpBareme[];
        duree_mois_par_defaut?: number;
        duree_depends_question?: boolean;
        duree_question_id?: string;
      };
    };
    if (Array.isArray(tmplCfg.sp_config_loyer?.baremes) && tmplCfg.sp_config_loyer!.baremes!.length > 0) {
      loyerBaremes = tmplCfg.sp_config_loyer!.baremes;
    }
    if (tmplCfg.sp_config_loyer) {
      loyerDureeConfig = {
        depends_question: tmplCfg.sp_config_loyer.duree_depends_question,
        question_id: tmplCfg.sp_config_loyer.duree_question_id,
        defaut: tmplCfg.sp_config_loyer.duree_mois_par_defaut,
      };
    }

    if (!loyerBaremes) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('preferences')
        .eq('id', user.id)
        .single();
      const orgCfg = isPlainObject(orgData?.preferences)
        ? (orgData.preferences as UnknownRecord).sp_config_loyer
        : undefined;
      if (isPlainObject(orgCfg)) {
        const cfg = orgCfg as UnknownRecord;
        if (Array.isArray(cfg.baremes) && (cfg.baremes as unknown[]).length > 0) {
          loyerBaremes = cfg.baremes as SpBareme[];
        } else if (Array.isArray(cfg.taux_durees)) {
          loyerBaremes = [{
            id: 'migrated',
            nom: 'Barème migré',
            ordre: 0,
            taux_durees: cfg.taux_durees as SpTauxDuree[],
          }];
        }
      }
    }

    if (!spConfigMoisOfferts) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('preferences')
        .eq('id', user.id)
        .single();
      const orgMoisOffertsCfg = isPlainObject(orgData?.preferences)
        ? (orgData.preferences as UnknownRecord).sp_config_mois_offerts
        : undefined;
      if (isPlainObject(orgMoisOffertsCfg) && Array.isArray(orgMoisOffertsCfg.categories_inclues)) {
        spConfigMoisOfferts = orgMoisOffertsCfg as unknown as SpConfigMoisOfferts;
      }
    }

    const questionVariableValues = templateQuestions.length > 0
      ? collectQuestionVariableValues(templateQuestions, spReponses)
      : {};
    const resiliationEstimation = estimateResiliationFromSA(
      isPlainObject(situation_actuelle) && isPlainObject(situation_actuelle.situation_actuelle)
        ? situation_actuelle
        : { situation_actuelle },
      resiliationConfig,
      propositionCreatedAt,
    );
    const montantIndemnites =
      normalizeResiliationAmount(questionVariableValues.sp_total_indemnites)
      ?? resiliationEstimation.montant_source
      ?? resiliationEstimation.montant_estime;

    const buildRaw = {
      ...rawResult,
      ...questionVariableValues,
      sp_questions_reponses: spReponses,
    };

    const suggestionsSpCompletes = buildSpCompletes(
      buildRaw,
      emptyBaseResult,
      adresse_facturation,
      adresse_livraison,
      livraison_identique,
      wordCfg,
      templateQuestions,
      catalogue as CatalogueProduit[],
      loyerBaremes,
      priceOverrides,
      typeof sp_fas_total === 'number' && sp_fas_total > 0 ? sp_fas_total : 0,
      loyerDureeConfig,
      spConfigMoisOfferts,
    );

    if (montantIndemnites !== null) {
      suggestionsSpCompletes.sp_total_indemnites = formatEuro(montantIndemnites);
    }

    if (typeof proposition_id === 'string' && proposition_id.length > 0) {
      const updatePayload: UnknownRecord = { suggestions_sp_completes: suggestionsSpCompletes };
      if (spReponses.length > 0) {
        updatePayload.sp_reponses = spReponses;
      }
      const { error: updateError } = await supabase
        .from('propositions')
        .update(updatePayload)
        .eq('id', proposition_id)
        .eq('organization_id', user.id);

      if (updateError) {
        console.error('Erreur sauvegarde suggestions:', updateError);
      }
    }

    return NextResponse.json(suggestionsSpCompletes);
  } catch {
    return NextResponse.json({ error: 'Erreur génération suggestions' }, { status: 500 });
  }
}
