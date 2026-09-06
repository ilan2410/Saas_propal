// Aggrège la situation actuelle (SA) extraite des documents pour affichage
// dans un panier temps réel comparable au panier SP.

export interface SaCartLine {
  libelle: string;
  categorie: 'fixe' | 'mobile' | 'internet' | 'abonnement' | 'location' | 'variable' | 'autre';
  operateur?: string;
  montant: number;
}

export interface SaCartSummary {
  lignesFixes: number;
  lignesMobiles: number;
  lignesInternet: number;
  abonnements: number;
  locations: number;
  /**
   * Somme des charges variables (consommations hors forfait, pénalités de
   * retard, frais ponctuels). Toujours renseignée, même quand elle n'est pas
   * comptée dans `totalMensuel` (cf. `chargesVariablesIncluses`).
   */
  chargesVariables: number;
  /**
   * true si les charges variables sont ajoutées au `totalMensuel`. Piloté par
   * le template via `situation_actuelle.totaux.charges_variables_incluses`
   * (défaut : true). Quand false, les lignes restent visibles à titre indicatif.
   */
  chargesVariablesIncluses: boolean;
  totalMensuel: number;
  /** true si le total mensuel provient des `totaux.total_solution_actuelle_*` extraits. */
  totalFromOfficiel: boolean;
  /** true si le total a été réconcilié sur les montants « source » (réellement facturés). */
  reconcileSource: boolean;
  hasData: boolean;
  details: SaCartLine[];
}

/** Libellé de la ligne ajoutée pour combler l'écart Source − Calculé. */
export const SA_RESIDUAL_LABEL = 'Autres éléments (non détaillés)';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const TVA_RATE = 1.2;

function normalizeItemsToHT(items: unknown, amountKeys: string[]): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (!isRecord(item)) return item;
    const precision = typeof item.precision_montant === 'string'
      ? item.precision_montant.trim().toUpperCase()
      : '';
    if (precision !== 'TTC') return item;

    const next = { ...item };
    for (const key of amountKeys) {
      const ttc = toNumber(next[key]);
      if (ttc !== 0) next[key] = round2(ttc / TVA_RATE);
    }
    next.precision_montant = 'HT';
    return next;
  });
}

/**
 * Les montants de la SA doivent toujours être affichés en HT. Le document
 * source peut ne fournir qu'un montant TTC (précision extraite par l'IA) :
 * dans ce cas on convertit au taux de TVA standard (20 %) pour rester
 * cohérent avec les montants calculés à partir des lignes.
 */
export function normalizeSaAmountsToHT(situationActuelle: unknown): Record<string, unknown> {
  const sa = isRecord(situationActuelle) ? { ...situationActuelle } : {};
  sa.abonnements = normalizeItemsToHT(sa.abonnements, [
    'tarif_net_mensuel',
    'tarif_brut_mensuel',
    'remise_mensuelle',
    'tarif',
  ]);
  sa.locations = normalizeItemsToHT(sa.locations, [
    'loyer_net_mensuel',
    'loyer_brut_mensuel',
    'remise_mensuelle',
    'tarif',
  ]);
  sa.lignes = normalizeItemsToHT(sa.lignes, [
    'tarif_net_mensuel',
    'tarif_brut_mensuel',
    'remise_mensuelle',
    'tarif',
  ]);
  sa.charges_variables = normalizeItemsToHT(sa.charges_variables, [
    'montant',
    'montant_mensuel',
    'montant_ht',
    'tarif',
  ]);

  const totaux = isRecord(sa.totaux) ? { ...sa.totaux } : {};
  const precision = typeof totaux.precision === 'string' ? totaux.precision.trim().toUpperCase() : '';
  if (precision === 'TTC') {
    for (const key of [
      'total_abonnements_source',
      'total_abonnements_calcule',
      'total_locations_source',
      'total_locations_calcule',
      'total_charges_variables_source',
      'total_charges_variables_calcule',
      'total_solution_actuelle_source',
      'total_solution_actuelle_calcule',
    ]) {
      const ttc = toNumber(totaux[key]);
      if (ttc !== 0) totaux[key] = round2(ttc / TVA_RATE);
    }
    totaux.precision = 'HT';
  }
  sa.totaux = totaux;
  return sa;
}

function pickMontant(item: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const v = toNumber(item[key]);
    if (v !== 0) return v;
  }
  return 0;
}

/** Quantité d'un abonnement/location (ex. "Forfait Mobile x3" facturé en une seule ligne). */
function pickQuantite(item: Record<string, unknown>): number {
  const q = toNumber(item.quantite);
  return q > 0 ? q : 1;
}

function getStr(item: Record<string, unknown>, key: string): string | undefined {
  const v = item[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function normalizeLabel(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function dedupeKey(libelle: string, montant: number): string {
  return `${normalizeLabel(libelle)}|${montant.toFixed(2)}`;
}

/** Vérifie si un abonnement chevauche une location (même libellé/matériel/montant). */
function isOverlap(
  aboKey: string,
  aboLibelle: string,
  aboMontant: number,
  locationKeys: Set<string>,
  locationLibellesByMontant: Map<string, Set<string>>,
): boolean {
  if (locationKeys.has(aboKey)) return true;
  // Match par libellé partiel + montant identique (gère les libellés tronqués)
  const montantKey = aboMontant.toFixed(2);
  const labels = locationLibellesByMontant.get(montantKey);
  if (!labels) return false;
  const normAbo = normalizeLabel(aboLibelle);
  for (const locLabel of labels) {
    if (normAbo.includes(locLabel) || locLabel.includes(normAbo)) return true;
  }
  return false;
}

export function calculateSaCartSummary(donneesExtraites: unknown): SaCartSummary {
  const root = isRecord(donneesExtraites) ? donneesExtraites : {};
  const rawSa = isRecord(root.situation_actuelle) ? root.situation_actuelle : root;
  const sa = normalizeSaAmountsToHT(rawSa);

  const details: SaCartLine[] = [];

  // ── 1. Locations (référence pour détecter les chevauchements) ─────
  const locationKeys = new Set<string>();
  const locationLibellesByMontant = new Map<string, Set<string>>();
  let locationsTotal = 0;
  const locs = Array.isArray(sa.locations) ? sa.locations : [];
  for (const raw of locs) {
    if (!isRecord(raw)) continue;
    const montantUnitaire = pickMontant(raw, ['loyer_net_mensuel', 'loyer_brut_mensuel']);
    if (montantUnitaire <= 0) continue;
    const montant = round2(montantUnitaire * pickQuantite(raw));
    const libelle =
      getStr(raw, 'libelle') || getStr(raw, 'materiel') || getStr(raw, 'libelle_contrat') || 'Location';
    const operateur = getStr(raw, 'leaser') || getStr(raw, 'operateur');
    const key = dedupeKey(libelle, montant);
    if (locationKeys.has(key)) continue;
    locationKeys.add(key);
    const montantKey = montant.toFixed(2);
    const set = locationLibellesByMontant.get(montantKey) ?? new Set<string>();
    set.add(normalizeLabel(libelle));
    locationLibellesByMontant.set(montantKey, set);
    locationsTotal += montant;
    details.push({ libelle, categorie: 'location', operateur, montant });
  }

  // ── 2. Abonnements (source principale des récurrents mensuels) ────
  // Si présents, ils contiennent généralement aussi les lignes → on n'ajoute
  // pas les lignes en plus pour éviter les doublons.
  const seenAbo = new Set<string>();
  let abonnementsTotal = 0;
  const abos = Array.isArray(sa.abonnements) ? sa.abonnements : [];
  for (const raw of abos) {
    if (!isRecord(raw)) continue;
    const montantUnitaire = pickMontant(raw, ['tarif_net_mensuel', 'tarif_brut_mensuel']);
    if (montantUnitaire === 0) continue;
    const montant = round2(montantUnitaire * pickQuantite(raw));
    const libelle = getStr(raw, 'libelle') || getStr(raw, 'libelle_contrat') || 'Abonnement';
    const operateur = getStr(raw, 'operateur');
    const key = dedupeKey(libelle, montant);
    if (seenAbo.has(key)) continue;
    seenAbo.add(key);
    // Exclu si chevauchement avec une location (= matériel loué déjà compté ailleurs)
    if (isOverlap(key, libelle, montant, locationKeys, locationLibellesByMontant)) continue;
    abonnementsTotal += montant;
    details.push({ libelle, categorie: 'abonnement', operateur, montant });
  }

  // ── 3. Lignes (fixe / mobile / internet) ───────────────────────────
  // Si l'array `abonnements` est rempli, on considère les lignes comme un
  // sous-ensemble déjà compté → on les expose en sous-catégorie sans les
  // ajouter au total. Sinon on les ajoute (cas où seules `lignes` existent).
  const lignes = Array.isArray(sa.lignes) ? sa.lignes : [];
  const aboPrimary = abos.length > 0;
  const seenLigne = new Set<string>();
  let lignesFixes = 0;
  let lignesMobiles = 0;
  let lignesInternet = 0;
  for (const raw of lignes) {
    if (!isRecord(raw)) continue;
    const montant = pickMontant(raw, ['tarif_net_mensuel', 'tarif_brut_mensuel']);
    if (montant === 0) continue;
    const type = (getStr(raw, 'type') ?? '').toLowerCase();
    const libelle =
      getStr(raw, 'libelle') ||
      getStr(raw, 'forfait') ||
      getStr(raw, 'numero_ligne') ||
      'Ligne';
    const operateur = getStr(raw, 'operateur');
    const key = dedupeKey(libelle, montant);
    if (seenLigne.has(key)) continue;
    seenLigne.add(key);
    let categorie: SaCartLine['categorie'] = 'autre';
    if (type === 'fixe') {
      lignesFixes += montant;
      categorie = 'fixe';
    } else if (type === 'mobile') {
      lignesMobiles += montant;
      categorie = 'mobile';
    } else if (type === 'internet') {
      lignesInternet += montant;
      categorie = 'internet';
    } else {
      categorie = 'autre';
    }
    // Si abonnements présents, on ajoute les lignes seulement aux détails
    // (pour information) sans recompter ; sinon on les ajoute aux totaux.
    if (!aboPrimary) {
      if (categorie === 'autre') abonnementsTotal += montant;
      details.push({ libelle, categorie, operateur, montant });
    } else {
      details.push({ libelle, categorie, operateur, montant });
    }
  }

  // ── 4. Réconciliation sur les montants « source » ─────────────────
  // Le client paie le montant RÉELLEMENT facturé (= « source » sur la
  // facture). La somme des lignes extraites (= « calculé ») peut être plus
  // basse si une option/un service n'a pas été détaillé. On aligne donc les
  // totaux sur la source et on ajoute une ligne résiduelle pour que la somme
  // des lignes reste égale au total réel.
  const totaux = isRecord(sa.totaux) ? sa.totaux : {};
  const abosSource = toNumber(totaux.total_abonnements_source);
  const locsSource = toNumber(totaux.total_locations_source);
  const solutionSource = toNumber(totaux.total_solution_actuelle_source);
  let reconcileSource = false;

  if (abosSource !== 0 && Math.abs(abosSource - abonnementsTotal) > 0.005) {
    const residual = round2(abosSource - abonnementsTotal);
    details.push({ libelle: SA_RESIDUAL_LABEL, categorie: 'abonnement', montant: residual });
    abonnementsTotal = round2(abosSource);
    reconcileSource = true;
  }
  if (locsSource !== 0 && Math.abs(locsSource - locationsTotal) > 0.005) {
    const residual = round2(locsSource - locationsTotal);
    details.push({ libelle: SA_RESIDUAL_LABEL, categorie: 'location', montant: residual });
    locationsTotal = round2(locsSource);
    reconcileSource = true;
  }

  // ── 4bis. Charges variables ──────────────────────────────────────
  // Consommations hors forfait, pénalités de retard, frais ponctuels. Poste
  // optionnel : ajouté au total mensuel seulement si le template le demande
  // (`totaux.charges_variables_incluses`, défaut true). Les lignes sont
  // toujours exposées dans `details` — grisées à l'affichage si non comptées.
  const chargesVariablesIncluses = totaux.charges_variables_incluses !== false;
  let chargesVariables = 0;
  const seenCharge = new Set<string>();
  const chargesRaw = Array.isArray(sa.charges_variables) ? sa.charges_variables : [];
  for (const raw of chargesRaw) {
    if (!isRecord(raw)) continue;
    const montant = pickMontant(raw, ['montant', 'montant_mensuel', 'montant_ht', 'tarif']);
    if (montant <= 0) continue;
    const libelle =
      getStr(raw, 'libelle') || getStr(raw, 'type') || 'Charge variable';
    const operateur = getStr(raw, 'operateur') || getStr(raw, 'document');
    const key = dedupeKey(libelle, montant);
    if (seenCharge.has(key)) continue;
    seenCharge.add(key);
    chargesVariables += montant;
    details.push({ libelle, categorie: 'variable', operateur, montant: round2(montant) });
  }
  if (chargesVariables <= 0) {
    // Pas de détail ligne à ligne : on retombe sur le total agrégé extrait.
    const totalCharges =
      toNumber(totaux.total_charges_variables_source) ||
      toNumber(totaux.total_charges_variables_calcule);
    if (totalCharges > 0) {
      chargesVariables = totalCharges;
      details.push({
        libelle: 'Consommations & frais variables',
        categorie: 'variable',
        montant: round2(totalCharges),
      });
    }
  }
  chargesVariables = round2(chargesVariables);

  // ── 5. Total final ─────────────────────────────────────────────────
  // Quand `abonnements` est la source primaire, lignes ne sont pas comptées.
  let totalMensuel = aboPrimary
    ? abonnementsTotal + locationsTotal
    : lignesFixes + lignesMobiles + lignesInternet + abonnementsTotal + locationsTotal;
  if (chargesVariablesIncluses) totalMensuel += chargesVariables;

  // Réconciliation au total solution « source » (écart résiduel non couvert
  // par les écarts abonnements/locations ci-dessus). Le prompt d'extraction
  // aligne `total_solution_actuelle_source` sur le même choix d'inclusion, donc
  // aucun double comptage ici.
  if (solutionSource !== 0 && Math.abs(solutionSource - totalMensuel) > 0.005) {
    const residual = round2(solutionSource - totalMensuel);
    details.push({ libelle: SA_RESIDUAL_LABEL, categorie: 'abonnement', montant: residual });
    abonnementsTotal = round2(abonnementsTotal + residual);
    totalMensuel = round2(solutionSource);
    reconcileSource = true;
  } else {
    totalMensuel = round2(totalMensuel);
  }

  const canonicalTotal = toNumber(sa.total_ht_mensuel_client);
  if (canonicalTotal > 0 && Math.abs(canonicalTotal - totalMensuel) > 0.005) {
    const residual = round2(canonicalTotal - totalMensuel);
    details.push({ libelle: SA_RESIDUAL_LABEL, categorie: 'abonnement', montant: residual });
    abonnementsTotal = round2(abonnementsTotal + residual);
    totalMensuel = round2(canonicalTotal);
    reconcileSource = true;
  }

  return {
    lignesFixes,
    lignesMobiles,
    lignesInternet,
    abonnements: abonnementsTotal,
    locations: locationsTotal,
    chargesVariables,
    chargesVariablesIncluses,
    totalMensuel,
    totalFromOfficiel: aboPrimary,
    reconcileSource,
    hasData: details.length > 0 || totalMensuel > 0,
    details,
  };
}
