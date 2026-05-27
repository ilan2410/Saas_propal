import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateClaudeApiKey } from '@/lib/ai/claude';
import Anthropic from '@anthropic-ai/sdk';
import type { SuggestionsSpCompletes, SpLigneMobile, SpLigneFixe, SpInternet, SpMateriel, SpQuestionReponse, SpAdresse, WordConfig, CatalogueProduit, SpBareme, SpTauxDuree, SpSituationProposeeLigne, SpMaterielDetail, SpBdcOperateurLigne, SpBdcInternetLigne, SpBdcMaterielLigne, SpCadeauLigne, SpQuestion, SpConfigResiliation } from '@/types';
import { calculerLoyer, calculerRemiseMoisOffert } from '@/lib/sp/calculLoyer';
import { findApplicableBareme } from '@/lib/sp/evaluateBareme';
import { collectQuestionVariableValues } from '@/lib/sp/questionVariables';
import { estimateResiliationFromSA } from '@/lib/sp/resiliation';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJsonFromText(text: string): unknown {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;
  return JSON.parse(jsonStr);
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

function isLikelyPriceKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('prix') ||
    normalized.includes('tarif') ||
    normalized.includes('montant') ||
    normalized.includes('cout') ||
    normalized.includes('coût') ||
    normalized.includes('total_ht') ||
    normalized.includes('totalttc') ||
    normalized.includes('total_ttc')
  );
}

function isLikelyIdentifierKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return [
    'numero',
    'num',
    'ligne',
    'tel',
    'telephone',
    'téléphone',
    'mobile',
    'id',
    'reference',
    'référence',
    'ref',
    'rio',
    'siret',
    'poste',
    'compte',
    'contrat',
    'ndi',
    'identifiant',
  ].some((token) => normalized.includes(token));
}

function isPlausiblePrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100000;
}

function extractMonthlyPrice(line: UnknownRecord): number | null {
  const exactKeys = [
    'prix_mensuel',
    'montant_mensuel',
    'tarif_mensuel',
    'cout_mensuel',
    'prix',
    'tarif',
    'montant',
    'total_ht',
    'total',
  ];

  for (const k of exactKeys) {
    const num = toNumber(line[k]);
    if (num !== null && isPlausiblePrice(num)) return num;
  }

  for (const [key, value] of Object.entries(line)) {
    if (isLikelyIdentifierKey(key) || !isLikelyPriceKey(key)) continue;
    const num = toNumber(value);
    if (num !== null && isPlausiblePrice(num)) return num;
  }

  for (const [key, value] of Object.entries(line)) {
    if (isLikelyIdentifierKey(key)) continue;
    if (typeof value !== 'string') continue;
    const lowered = value.toLowerCase();
    const hasMoneyHint = lowered.includes('€') || lowered.includes('eur') || /[.,]\d{1,2}\b/.test(lowered);
    if (!hasMoneyHint) continue;
    const num = toNumber(value);
    if (num !== null && isPlausiblePrice(num)) return num;
  }

  return null;
}

function extractPriceFromCatalogueItem(item: unknown): number | null {
  if (!isPlainObject(item)) return null;

  const candidates = [
    item.prix_mensuel,
    item.tarif_mensuel,
    item.montant_mensuel,
    item.prix,
    item.tarif,
    item.montant,
  ];

  for (const candidate of candidates) {
    const num = toNumber(candidate);
    if (num !== null && isPlausiblePrice(num)) return num;
  }

  return null;
}

function shouldExcludePath(pathLower: string): boolean {
  const excluded = [
    'contact',
    'contacts',
    'adresse',
    'adresses',
    'facturation',
    'releve',
    'releves',
    'compteur',
    'compteurs',
    'engagement',
    'engagements',
    'document',
    'documents',
    'fichier',
    'fichiers',
    'piece',
    'pieces',
    'materiel',
    'materiels',
    'location',
    'locations',
    'maintenance',
  ];
  return excluded.some((t) => pathLower.includes(t));
}

function looksLikeTelecomLinesPath(pathLower: string): boolean {
  const hints = [
    'ligne',
    'lignes',
    'service',
    'services',
    'abonnement',
    'abonnements',
    'forfait',
    'forfaits',
    'mobile',
    'fixe',
    'internet',
    'fibre',
    'adsl',
    'box',
    'telephonie',
    'telecom',
    'sim',
  ];
  return hints.some((t) => pathLower.includes(t));
}

function looksLikeLineItem(item: UnknownRecord): boolean {
  const keys = Object.keys(item);
  if (keys.length === 0) return false;

  const hasUsefulKey = keys.some((k) => {
    const kl = k.toLowerCase();
    return (
      kl.includes('prix') ||
      kl.includes('tarif') ||
      kl.includes('montant') ||
      kl.includes('cout') ||
      kl.includes('forfait') ||
      kl.includes('type') ||
      kl.includes('categorie') ||
      kl.includes('numero') ||
      kl.includes('debit') ||
      kl.includes('data')
    );
  });

  if (hasUsefulKey) return true;

  const hasPrimitive = Object.values(item).some((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
  return hasPrimitive && keys.length >= 2;
}

function collectLinesToAnalyze(situationActuelle: unknown): UnknownRecord[] {
  const results: UnknownRecord[] = [];
  const seen = new Set<string>();

  const addLine = (line: UnknownRecord, path: string, index: number) => {
    const stableKey = JSON.stringify(line);
    if (seen.has(stableKey)) return;
    seen.add(stableKey);
    results.push({ ...line, __meta: { path, index } });
  };

  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      const pathLower = path.toLowerCase();
      if (shouldExcludePath(pathLower)) return;

      const objectItems = node.filter((v) => isPlainObject(v)) as UnknownRecord[];
      const isMostlyObjects = objectItems.length > 0 && objectItems.length / node.length >= 0.6;

      if (isMostlyObjects) {
        const isPreferred = looksLikeTelecomLinesPath(pathLower);
        for (let i = 0; i < objectItems.length; i += 1) {
          const item = objectItems[i];
          if (isPreferred || looksLikeLineItem(item)) addLine(item, path, i);
        }
      }

      return;
    }

    if (!isPlainObject(node)) return;
    for (const [k, v] of Object.entries(node)) {
      const nextPath = path ? `${path}.${k}` : k;
      walk(v, nextPath);
    }
  };

  walk(situationActuelle, '');

  if (results.length > 0) return results;
  if (isPlainObject(situationActuelle)) return [{ ...situationActuelle, __meta: { path: 'root', index: 0 } }];
  return [];
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

function buildFallbackSuggestion(line: UnknownRecord) {
  const prix = extractMonthlyPrice(line) ?? 0;
  return {
    ligne_actuelle: line,
    produit_propose_nom: 'Aucun produit similaire trouvé',
    prix_actuel: prix,
    prix_propose: prix,
    economie_mensuelle: 0,
    justification: "Aucun produit de votre catalogue ne semble correspondre à cette ligne/service.",
  };
}

function findSupplierInCatalogue(catalogue: unknown[], produitId?: string, produitNom?: string): string | undefined {
  const id = typeof produitId === 'string' && produitId.trim() ? produitId.trim() : undefined;
  const nom = typeof produitNom === 'string' && produitNom.trim() ? produitNom.trim().toLowerCase() : undefined;

  if (!id && !nom) return undefined;

  for (const item of catalogue) {
    if (!isPlainObject(item)) continue;

    const itemId = typeof item.id === 'string' ? item.id : undefined;
    const itemNom = typeof item.nom === 'string' ? item.nom : undefined;
    const itemFournisseur = typeof item.fournisseur === 'string' ? item.fournisseur : undefined;

    if (!itemFournisseur) continue;

    if (id && itemId === id) return itemFournisseur;
    if (nom && itemNom && itemNom.toLowerCase() === nom) return itemFournisseur;
  }

  return undefined;
}

function findCatalogueItem(catalogue: unknown[], produitId?: string, produitNom?: string): UnknownRecord | undefined {
  const id = typeof produitId === 'string' && produitId.trim() ? produitId.trim() : undefined;
  const nom = typeof produitNom === 'string' && produitNom.trim() ? produitNom.trim().toLowerCase() : undefined;

  if (!id && !nom) return undefined;

  for (const item of catalogue) {
    if (!isPlainObject(item)) continue;

    const itemId = typeof item.id === 'string' ? item.id : undefined;
    const itemNom = typeof item.nom === 'string' ? item.nom : undefined;

    if (id && itemId === id) return item;
    if (nom && itemNom && itemNom.toLowerCase() === nom) return item;
  }

  return undefined;
}

function resolveCurrentPrice(rawPrice: unknown, line: UnknownRecord): number {
  const extracted = extractMonthlyPrice(line);
  if (extracted !== null) return extracted;

  const candidate = toNumber(rawPrice);
  if (candidate !== null && isPlausiblePrice(candidate)) return candidate;

  return 0;
}

function resolveProposedPrice(rawPrice: unknown, fallbackCurrentPrice: number, catalogueItem?: UnknownRecord): number {
  const cataloguePrice = extractPriceFromCatalogueItem(catalogueItem);
  if (cataloguePrice !== null) return cataloguePrice;

  if (!catalogueItem) return fallbackCurrentPrice;

  const candidate = toNumber(rawPrice);
  if (candidate !== null && isPlausiblePrice(candidate)) return candidate;

  return fallbackCurrentPrice;
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

function normalizeResult(
  raw: unknown,
  lines: UnknownRecord[],
  catalogue: unknown[],
  priceOverrides: Map<string, number>,
): SuggestionResult {
  const empty: SuggestionResult = {
    suggestions: lines.map((l) => buildFallbackSuggestion(l)),
    synthese: {
      cout_total_actuel: 0,
      cout_total_propose: 0,
      economie_mensuelle: 0,
      economie_annuelle: 0,
      ameliorations: ['Aucun produit similaire trouvé dans le catalogue'],
    },
  };

  if (!isPlainObject(raw)) return empty;
  const rawSuggestions = Array.isArray(raw.suggestions) ? raw.suggestions : [];
  const rawSynthese = isPlainObject(raw.synthese) ? raw.synthese : {};

  const suggestions = rawSuggestions
    .map((s) => (isPlainObject(s) ? (s as UnknownRecord) : null))
    .filter(Boolean)
    .map((s) => {
      const ligneActuelle = isPlainObject(s!.ligne_actuelle) ? (s!.ligne_actuelle as UnknownRecord) : {};
      const produitProposeNom =
        typeof s!.produit_propose_nom === 'string' && s!.produit_propose_nom.trim()
          ? s!.produit_propose_nom
          : 'Aucun produit similaire trouvé';
      const justification =
        typeof s!.justification === 'string' && s!.justification.trim()
          ? s!.justification
          : "Aucun produit de votre catalogue ne semble correspondre à cette ligne/service.";
      const prixActuel = resolveCurrentPrice(s!.prix_actuel, ligneActuelle);

      const out: SuggestionResult['suggestions'][number] = {
        ligne_actuelle: ligneActuelle,
        produit_propose_nom: produitProposeNom,
        prix_actuel: prixActuel,
        prix_propose: prixActuel,
        economie_mensuelle: 0,
        justification,
      };

      if (typeof s!.produit_propose_id === 'string' && s!.produit_propose_id.trim()) {
        out.produit_propose_id = s!.produit_propose_id;
      }

      const catalogueItem = findCatalogueItem(catalogue, out.produit_propose_id, out.produit_propose_nom);
      const overriddenPrice = getPriceOverride(priceOverrides, out.produit_propose_id, out.produit_propose_nom);
      const prixPropose = overriddenPrice ?? resolveProposedPrice(s!.prix_propose, prixActuel, catalogueItem);
      const economieMensuelle = prixActuel - prixPropose;

      out.prix_actuel = prixActuel;
      out.prix_propose = prixPropose;
      out.economie_mensuelle = economieMensuelle;

      const fournisseur = findSupplierInCatalogue(catalogue, out.produit_propose_id, out.produit_propose_nom);
      if (fournisseur) out.produit_propose_fournisseur = fournisseur;

      return out;
    });

  const targetCount = Math.max(0, lines.length);
  const resized =
    suggestions.length >= targetCount
      ? suggestions.slice(0, targetCount)
      : suggestions.concat(lines.slice(suggestions.length).map((l) => buildFallbackSuggestion(l)));

  const coutTotalActuel = resized.reduce((sum, s) => sum + (Number.isFinite(s.prix_actuel) ? s.prix_actuel : 0), 0);
  const coutTotalPropose = resized.reduce((sum, s) => sum + (Number.isFinite(s.prix_propose) ? s.prix_propose : 0), 0);
  const economieMensuelle = coutTotalActuel - coutTotalPropose;
  const economieAnnuelle = economieMensuelle * 12;

  const ameliorations = Array.isArray(rawSynthese.ameliorations)
    ? rawSynthese.ameliorations.filter((v) => typeof v === 'string') as string[]
    : undefined;

  return {
    suggestions: resized,
    synthese: {
      cout_total_actuel: coutTotalActuel,
      cout_total_propose: coutTotalPropose,
      economie_mensuelle: economieMensuelle,
      economie_annuelle: economieAnnuelle,
      ameliorations,
    },
  };
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

function buildSpCompletes(
  raw: UnknownRecord,
  baseResult: SuggestionResult,
  adresseFacturation: SpAdresse | undefined,
  adresseLivraison: SpAdresse | null | undefined,
  livraisonIdentique: boolean,
  wordCfg: WordConfig,
  catalogueProduits?: CatalogueProduit[],
  loyerBaremes?: SpBareme[],
  priceOverrides: Map<string, number> = new Map(),
  fasTotal = 0,
  loyerDureeConfig?: { depends_question?: boolean; question_id?: string; defaut?: number },
): SuggestionsSpCompletes {
  const rawMobiles = Array.isArray(raw.sp_lignes_mobiles) ? raw.sp_lignes_mobiles as UnknownRecord[] : [];
  const rawFixes = Array.isArray(raw.sp_lignes_fixes) ? raw.sp_lignes_fixes as UnknownRecord[] : [];
  const rawInternet = Array.isArray(raw.sp_internet) ? raw.sp_internet as UnknownRecord[] : [];
  const rawMateriel = Array.isArray(raw.sp_materiel) ? raw.sp_materiel as UnknownRecord[] : [];

  const sp_lignes_mobiles: SpLigneMobile[] = rawMobiles.map((r) => ({ ...buildSpLigne(r, priceOverrides), sp_type_ligne: 'Mobile' as const }));
  const sp_lignes_fixes: SpLigneFixe[] = rawFixes.map((r) => ({ ...buildSpLigne(r, priceOverrides), sp_type_ligne: 'Fixe' as const }));
  const sp_internet: SpInternet[] = rawInternet.map((r) => ({ ...buildSpLigne(r, priceOverrides), sp_type_ligne: 'Internet' as const }));
  const sp_materiel: SpMateriel[] = rawMateriel.map((r) => buildSpMateriel(r, priceOverrides));

  const toutes = [...sp_lignes_mobiles, ...sp_lignes_fixes, ...sp_internet];
  const economieTotale = toutes.reduce((s, l) => s + l._economie_raw, 0);
  const totalActuel = toutes.reduce((s, l) => s + l._prix_actuel_raw, 0);
  const totalPropose = toutes.reduce((s, l) => s + l._prix_propose_raw, 0);

  // ── Récurrent / Ponctuel breakdown via catalogue type_frequence ──
  const catalogueMap = new Map<string, CatalogueProduit>();
  if (catalogueProduits) {
    for (const p of catalogueProduits) catalogueMap.set(p.id, p);
  }

  // Lines (mobiles/fixes/internet) are always recurrent (monthly)
  const totalRecurrentLignes = totalPropose;

  // Material: split by type_frequence
  let totalMaterielRecurrent = 0;
  let totalMaterielPonctuel = 0;
  for (const m of sp_materiel) {
    const catalogueItem = m.sp_materiel_produit_id ? catalogueMap.get(m.sp_materiel_produit_id) : undefined;
    const freq = catalogueItem?.type_frequence ?? 'mensuel';
    if (freq === 'unique') {
      totalMaterielPonctuel += m._prix_mensuel_raw; // one-time cost
    } else {
      totalMaterielRecurrent += m._prix_mensuel_raw;
    }
  }

  const totalRecurrent = totalRecurrentLignes + totalMaterielRecurrent;
  const totalPonctuel = totalMaterielPonctuel;

  // ── Loyer calculation ──
  const reponses = Array.isArray(raw.sp_questions_reponses)
    ? (raw.sp_questions_reponses as SpQuestionReponse[])
    : [];

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
  const remiseMoisOffert = dureeMois > 0 ? calculerRemiseMoisOffert(bareme, totalRecurrent, dureeMois) : 0;
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

  // sp_situation_proposee_complet: tout (forfaits + matériel)
  result.sp_situation_proposee_complet = [
    ...toutes.map(toSituationLigne),
    ...sp_materiel.map(toSituationMateriel),
  ];

  // sp_materiel_detail: matériel enrichi avec infos catalogue
  result.sp_materiel_detail = sp_materiel.map((m): SpMaterielDetail => {
    const cat = m.sp_materiel_produit_id ? catalogueMap.get(m.sp_materiel_produit_id) : undefined;
    const freq = cat?.type_frequence ?? 'mensuel';
    const imageUrl = typeof cat?.image_url === 'string' ? cat.image_url : undefined;
    return {
      sp_matd_nom: m.sp_materiel_nom,
      sp_matd_ref: m.sp_materiel_ref,
      sp_matd_fournisseur: m.sp_materiel_fournisseur,
      sp_matd_quantite: '1',
      sp_matd_prix_ht: m.sp_materiel_prix_mensuel,
      sp_matd_commentaire: m.sp_materiel_commentaire,
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
      const cat = catalogueMap.get(m.sp_materiel_produit_id);
      return cat?.destinations?.bdc_materiel !== false;
    })
    .map((m): SpBdcMaterielLigne => {
      const cat = m.sp_materiel_produit_id ? catalogueMap.get(m.sp_materiel_produit_id) : undefined;
      const freq = cat?.type_frequence ?? 'mensuel';
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

    if (!validateClaudeApiKey()) {
      return NextResponse.json(
        {
          error: 'Clé API Claude non configurée',
          details: "La variable ANTHROPIC_API_KEY n'est pas définie",
        },
        { status: 500 }
      );
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

    const fournisseur_prefere: string | undefined = isPlainObject(preferences) && typeof preferences.fournisseur_prefere === 'string' ? preferences.fournisseur_prefere : undefined;
    const proposer_materiel: boolean = isPlainObject(preferences) && preferences.proposer_materiel === true;
    const adresse_facturation: SpAdresse | undefined = isPlainObject(preferences) && isPlainObject(preferences.adresse_facturation) ? preferences.adresse_facturation as unknown as SpAdresse : undefined;
    const adresse_livraison: SpAdresse | null | undefined = isPlainObject(preferences) ? (isPlainObject(preferences.adresse_livraison) ? preferences.adresse_livraison as unknown as SpAdresse : null) : undefined;
    const livraison_identique: boolean = isPlainObject(preferences) && preferences.livraison_identique === true;
    const spReponses: SpQuestionReponse[] = Array.isArray(sp_questions_reponses) ? sp_questions_reponses as SpQuestionReponse[] : [];

    if (typeof proposition_id === 'string' && proposition_id.length > 0) {
      const { data: proposition, error: propError } = await supabase
        .from('propositions')
        .select('id, suggestions_generees')
        .eq('id', proposition_id)
        .eq('organization_id', user.id)
        .single();

      if (propError || !proposition) {
        return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
      }

      if (proposition.suggestions_generees && !force_regenerate) {
        return NextResponse.json(proposition.suggestions_generees);
      }
    }

    if (!Array.isArray(catalogue)) {
      return NextResponse.json({ error: 'catalogue invalide' }, { status: 400 });
    }

    const lignesAAnalyser = collectLinesToAnalyze(situation_actuelle ?? {});

    const reponsesSummary = spReponses.length > 0
      ? `\nRÉPONSES AUX QUESTIONS SP:\n${JSON.stringify(spReponses, null, 2)}`
      : '';

    const prompt = `Tu es un expert en télécommunications. Analyse la situation actuelle et génère une proposition complète.

SITUATION ACTUELLE:
${JSON.stringify(situation_actuelle ?? {}, null, 2)}

LIGNES À ANALYSER (${lignesAAnalyser.length} éléments, ordre imposé):
${JSON.stringify(lignesAAnalyser, null, 2)}

NOTRE CATALOGUE (${catalogue.length} produits):
${JSON.stringify(catalogue, null, 2)}
${reponsesSummary}
${fournisseur_prefere ? `\nFOURNISSEUR PRÉFÉRÉ: ${fournisseur_prefere}` : ''}

RÈGLE ABSOLUE 1 — PRODUITS:
- Tu ne peux proposer QUE des produits qui existent dans NOTRE CATALOGUE avec leur ID exact.
- Si aucun produit du catalogue ne convient: produit_propose_nom = "Aucun produit semblable trouvé", produit_propose_id = null, prix_propose = prix_actuel, economie_mensuelle = 0
- INTERDICTION ABSOLUE de reprendre un produit de la situation actuelle ou d'inventer un produit.

RÈGLE ABSOLUE 2 — FOURNISSEUR:
- ${fournisseur_prefere ? `Fournisseur préféré: ${fournisseur_prefere}. Privilégier ses produits EN PRIORITÉ.` : 'Aucun fournisseur préféré spécifié.'}
- Si aucun produit du fournisseur préféré ne convient: retourner "Aucun produit semblable trouvé".

RÈGLE ABSOLUE 3 — MATÉRIEL:
- N'inclure sp_materiel QUE si proposer_materiel = ${proposer_materiel}.
- Le matériel doit venir du catalogue (catégorie equipement) uniquement.

INSTRUCTIONS:
1. Pour chaque ligne dans LIGNES À ANALYSER (même ordre), une entrée dans "suggestions".
2. Catégoriser chaque ligne: Mobile, Fixe, Internet selon son type.
3. Retourner aussi les tableaux sp_lignes_mobiles, sp_lignes_fixes, sp_internet${proposer_materiel ? ', sp_materiel' : ''}.
4. Utiliser les _raw pour les nombres (non formatés), ex: _prix_actuel_raw: 29.9

RETOURNE UNIQUEMENT UN JSON VALIDE (sans markdown, sans backticks):
{
  "suggestions": [{"ligne_actuelle": {}, "produit_propose_id": "uuid", "produit_propose_nom": "...", "prix_actuel": 0, "prix_propose": 0, "economie_mensuelle": 0, "justification": "..."}],
  "synthese": {"cout_total_actuel": 0, "cout_total_propose": 0, "economie_mensuelle": 0, "economie_annuelle": 0, "ameliorations": ["..."]},
  "sp_lignes_mobiles": [{"sp_nom_ligne": "...", "sp_produit": "...", "sp_produit_id": "uuid-ou-null", "sp_produit_fournisseur": "...", "sp_type_ligne": "Mobile", "_prix_actuel_raw": 0, "_prix_propose_raw": 0, "_economie_raw": 0, "sp_analyse": "...", "sp_justification": "..."}],
  "sp_lignes_fixes": [],
  "sp_internet": [],
  ${proposer_materiel ? '"sp_materiel": [{"sp_materiel_nom": "...", "sp_materiel_ref": "...", "sp_materiel_produit_id": "uuid-ou-null", "sp_materiel_fournisseur": "...", "sp_type_ligne": "Materiel", "_prix_mensuel_raw": 0, "sp_materiel_duree_engagement": "...", "sp_materiel_commentaire": "..."}],' : '"sp_materiel": [],'}
  "sp_fournisseur_propose": "...",
  "sp_ameliorations": "..."
}`;

    const model = process.env.CLAUDE_MODEL_SUGGESTIONS || 'claude-sonnet-4-6';

    const message = await anthropic.messages.create({
      model,
      max_tokens: 16384,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const result = extractJsonFromText(text);

    const priceOverrides = buildPriceOverridesMap(spReponses);
    const normalized = normalizeResult(result, lignesAAnalyser, catalogue, priceOverrides);

    // Construction des données SP complètes si l'IA a retourné des tableaux SP
    let suggestionsSpCompletes: SuggestionsSpCompletes | null = null;
    const rawResult = isPlainObject(result) ? result as UnknownRecord : {};

    if (
      Array.isArray(rawResult.sp_lignes_mobiles) ||
      Array.isArray(rawResult.sp_lignes_fixes) ||
      Array.isArray(rawResult.sp_internet)
    ) {
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

      // 1. Template file_config (new format)
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

      // 2. Org preferences fallback (supports new {baremes:[]} and legacy {taux_durees:[]})
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
            // Convert legacy format to single fallback barème
            loyerBaremes = [{
              id: 'migrated',
              nom: 'Barème migré',
              ordre: 0,
              taux_durees: cfg.taux_durees as SpTauxDuree[],
            }];
          }
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

      suggestionsSpCompletes = buildSpCompletes(
        buildRaw,
        normalized,
        adresse_facturation,
        adresse_livraison,
        livraison_identique,
        wordCfg,
        catalogue as CatalogueProduit[],
        loyerBaremes,
        priceOverrides,
        typeof sp_fas_total === 'number' && sp_fas_total > 0 ? sp_fas_total : 0,
        loyerDureeConfig,
      );

      if (montantIndemnites !== null) {
        suggestionsSpCompletes.sp_total_indemnites = formatEuro(montantIndemnites);
      }
    }

    if (typeof proposition_id === 'string' && proposition_id.length > 0) {
      const updatePayload: UnknownRecord = { suggestions_generees: normalized };
      if (suggestionsSpCompletes) {
        updatePayload.suggestions_sp_completes = suggestionsSpCompletes;
      }
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

    return NextResponse.json(suggestionsSpCompletes ?? normalized);
  } catch {
    return NextResponse.json({ error: 'Erreur génération suggestions' }, { status: 500 });
  }
}
