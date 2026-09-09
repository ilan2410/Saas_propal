// Logique d'édition du panier SA (Situation Actuelle).
//
// Le panier SA est dérivé de `situation_actuelle.{abonnements,locations,lignes,totaux}`
// via `calculateSaCartSummary` (anti-double-comptage + réconciliation sur les
// totaux « source »). Ce module permet d'ajouter / modifier / supprimer des
// lignes **sans modifier `calculateSaCartSummary`**, en agissant uniquement sur
// les données :
//
//   1. À chaque édition, on matérialise d'abord la (les) ligne(s) résiduelle(s)
//      « Autres éléments (non détaillés) » en vrais items, pour préserver le
//      montant réellement facturé non détaillé.
//   2. On applique la mutation (add/update/delete).
//   3. On recale `totaux.total_*_source` sur les sommes « pures » (calculées
//      en ignorant ces mêmes champs) → la réconciliation devient un no-op et
//      le total suit désormais exactement la somme des lignes.
//
// Cas des boucles SP : un abonnement typé (fixe/mobile/internet) doit alimenter
// les questions qui bouclent sur `situation_actuelle.lignes` (seul array portant
// un champ `type`). On l'écrit donc toujours dans `lignes` ; si la SA est en
// régime « aboPrimary » (présence d'`abonnements`), on pousse aussi un item lié
// dans `abonnements` (pour qu'il soit compté), les deux étant liés par
// `_sa_line_uid`. Si la SA est basée-lignes, on n'écrit que dans `lignes` (déjà
// compté) afin de ne pas faire basculer le régime de comptage.

import { calculateSaCartSummary, SA_RESIDUAL_LABEL, SA_VARIABLE_AGGREGATE_LABEL } from './calculateSaCart';

export type SaSection = 'abonnement' | 'location' | 'variable';
export type SaLigneType = 'fixe' | 'mobile' | 'internet';

export interface SaEditableLine {
  /** Identité stable vers l'item source : 'abonnements:0' | 'lignes:2' | 'locations:1' | 'residual:abo' | 'residual:loc'. */
  id: string;
  section: SaSection;
  designation: string;
  numero: string;
  quantite: number;
  montant: number;
  isResidual: boolean;
  /** Remise mensuelle appliquée à cette ligne (source `remise_mensuelle`), si présente. */
  remise?: number;
}

export interface SaAddInput {
  section: SaSection;
  /** Uniquement pour un abonnement : alimente le champ `type` de la ligne (boucles SP). */
  type?: SaLigneType;
  designation: string;
  numero?: string;
  quantite: number;
  montant: number;
}

export interface SaLinePatch {
  designation?: string;
  numero?: string;
  quantite?: number;
  montant?: number;
}

export type SaEditOp =
  | { kind: 'add'; input: SaAddInput }
  | { kind: 'update'; id: string; patch: SaLinePatch }
  | { kind: 'delete'; id: string };

/**
 * Ancres de réconciliation de `calculateSaCartSummary` situées dans `totaux`.
 * Retirées pour obtenir la somme « pure » des lignes, puis réécrites dessus.
 */
const SOURCE_KEYS = [
  'total_abonnements_source',
  'total_locations_source',
  'total_charges_variables_source',
  'total_charges_variables_calcule',
  'total_solution_actuelle_source',
] as const;

/**
 * Ancre de réconciliation située à la racine de `situation_actuelle`
 * (écrite par le pipeline SA). Sans elle dans la liste, toute édition du panier
 * était annulée : le total repartait vers la valeur d'origine via une ligne
 * résiduelle invisible.
 */
const CANONICAL_TOTAL_KEY = 'total_ht_mensuel_client';

const ABO_PRICE_KEYS = ['tarif_net_mensuel', 'tarif_brut_mensuel'];
const LOC_PRICE_KEYS = ['loyer_net_mensuel', 'loyer_brut_mensuel'];
const CHARGE_PRICE_KEYS = ['montant', 'montant_mensuel', 'montant_ht', 'tarif'];

const DEFAULT_LABELS: Record<SaSection, string> = {
  abonnement: 'Abonnement',
  location: 'Location',
  variable: 'Charge variable',
};

// ── Helpers (alignés sur calculateSaCart.ts) ─────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function getStr(item: Record<string, unknown>, key: string): string {
  const v = item[key];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function pickMontant(item: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const v = toNumber(item[key]);
    if (v > 0) return v;
  }
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function uid(): string {
  return `sa_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function rawArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function records(value: unknown): Record<string, unknown>[] {
  return rawArray(value).filter(isRecord);
}

function ensureArray(sa: Record<string, unknown>, key: string): unknown[] {
  if (!Array.isArray(sa[key])) sa[key] = [];
  return sa[key] as unknown[];
}

function isAboPrimary(sa: Record<string, unknown>): boolean {
  return records(sa.abonnements).length > 0;
}

/**
 * Résumé « pur » : calculé en ignorant TOUTES les ancres de réconciliation
 * (totaux « source » + total canonique) → strictement la somme des lignes.
 */
function pureSummary(sa: Record<string, unknown>) {
  const saCopy = clone(sa);
  if (isRecord(saCopy.totaux)) {
    for (const k of SOURCE_KEYS) delete (saCopy.totaux as Record<string, unknown>)[k];
  }
  delete saCopy[CANONICAL_TOTAL_KEY];
  return calculateSaCartSummary({ situation_actuelle: saCopy });
}

// ── Construction de la vue éditable ──────────────────────────────────

/**
 * Résout le numéro de ligne réel d'un item (abonnement/location) :
 *  1. `numero_ligne` direct s'il existe déjà dessus ;
 *  2. sinon, le `numero_ligne` d'un item de `lignes` rattaché au même contrat
 *     (même `engagement_ref` ou `reference_contrat`) — cas fréquent où la
 *     facture détaille le numéro sur une ligne « chapeau » et regroupe les
 *     options (extensions, SDA, etc.) sous le même engagement sans le répéter ;
 *  3. sinon '' — `reference_contrat` n'est PAS un numéro de ligne/téléphone,
 *     on ne l'affiche jamais sous ce label pour éviter de le faire passer
 *     pour un numéro.
 */
function resolveNumero(item: Record<string, unknown>, sa: Record<string, unknown>): string {
  const direct = getStr(item, 'numero_ligne');
  if (direct) return direct;

  const engagementRef = getStr(item, 'engagement_ref');
  const referenceContrat = getStr(item, 'reference_contrat');
  if (!engagementRef && !referenceContrat) return '';

  for (const raw of records(sa.lignes)) {
    const num = getStr(raw, 'numero_ligne');
    if (!num) continue;
    const sameEngagement = !!engagementRef && getStr(raw, 'engagement_ref') === engagementRef;
    const sameContrat = !!referenceContrat && getStr(raw, 'reference_contrat') === referenceContrat;
    if (sameEngagement || sameContrat) return num;
  }
  return '';
}

function readLine(
  item: Record<string, unknown>,
  id: string,
  section: SaSection,
  montant: number,
  sa: Record<string, unknown>,
): SaEditableLine {
  const designation =
    section === 'location'
      ? getStr(item, 'libelle') || getStr(item, 'materiel') || getStr(item, 'libelle_contrat')
      : section === 'variable'
        ? getStr(item, 'libelle') || getStr(item, 'type')
        : getStr(item, 'libelle') || getStr(item, 'forfait') || getStr(item, 'libelle_contrat');
  const remise = toNumber(item.remise_mensuelle);
  return {
    id,
    section,
    designation: designation || DEFAULT_LABELS[section],
    numero: section === 'variable' ? '' : resolveNumero(item, sa),
    quantite: Math.max(1, toNumber(item.quantite) || 1),
    montant,
    isResidual: item._sa_residual === true,
    remise: remise > 0 ? remise : undefined,
  };
}

/**
 * Lignes éditables du panier SA, cohérentes avec le régime de comptage de
 * `calculateSaCartSummary` :
 *  - aboPrimary → on liste les items `abonnements` (les `lignes` sont des jumelles
 *    informatives) ;
 *  - sinon → on liste les items `lignes` comptés.
 * Plus les éventuelles lignes résiduelles non encore matérialisées.
 */
export function getSaEditableLines(situationActuelle: unknown): SaEditableLine[] {
  const sa = isRecord(situationActuelle) ? situationActuelle : {};
  const summary = calculateSaCartSummary({ situation_actuelle: sa });
  const pure = pureSummary(sa);
  const aboPrimary = isAboPrimary(sa);
  const lines: SaEditableLine[] = [];

  // ── Section Abonnements ──
  let hasMaterializedAbo = false;
  if (aboPrimary) {
    records(sa.abonnements).forEach((item, i) => {
      lines.push(readLine(item, `abonnements:${i}`, 'abonnement', pickMontant(item, ABO_PRICE_KEYS), sa));
      if (item._sa_residual === true) hasMaterializedAbo = true;
    });
  } else {
    records(sa.lignes).forEach((item, i) => {
      const montant = pickMontant(item, ABO_PRICE_KEYS);
      if (montant <= 0 && item._sa_residual !== true) return;
      lines.push(readLine(item, `lignes:${i}`, 'abonnement', montant, sa));
      if (item._sa_residual === true) hasMaterializedAbo = true;
    });
  }
  const residualAbo = round2(summary.abonnements - pure.abonnements);
  if (residualAbo > 0.005 && !hasMaterializedAbo) {
    lines.push({
      id: 'residual:abo',
      section: 'abonnement',
      designation: SA_RESIDUAL_LABEL,
      numero: '',
      quantite: 1,
      montant: residualAbo,
      isResidual: true,
    });
  }

  // ── Section Locations ──
  let hasMaterializedLoc = false;
  records(sa.locations).forEach((item, i) => {
    lines.push(readLine(item, `locations:${i}`, 'location', pickMontant(item, LOC_PRICE_KEYS), sa));
    if (item._sa_residual === true) hasMaterializedLoc = true;
  });
  const residualLoc = round2(summary.locations - pure.locations);
  if (residualLoc > 0.005 && !hasMaterializedLoc) {
    lines.push({
      id: 'residual:loc',
      section: 'location',
      designation: SA_RESIDUAL_LABEL,
      numero: '',
      quantite: 1,
      montant: residualLoc,
      isResidual: true,
    });
  }

  // ── Section Charges variables ──
  // Détaillées ligne à ligne quand la facture les distingue ; sinon une seule
  // ligne agrégée reprenant `totaux.total_charges_variables_*`.
  let hasChargeDetail = false;
  records(sa.charges_variables).forEach((item, i) => {
    const montant = pickMontant(item, CHARGE_PRICE_KEYS);
    if (montant <= 0) return;
    hasChargeDetail = true;
    lines.push(readLine(item, `charges_variables:${i}`, 'variable', montant, sa));
  });
  if (!hasChargeDetail && summary.chargesVariables > 0.005) {
    lines.push({
      id: 'aggregate:variable',
      section: 'variable',
      designation: SA_VARIABLE_AGGREGATE_LABEL,
      numero: '',
      quantite: 1,
      montant: summary.chargesVariables,
      isResidual: true,
    });
  }

  return lines;
}

// ── Mutations ────────────────────────────────────────────────────────

function materializeResiduals(sa: Record<string, unknown>): void {
  const summary = calculateSaCartSummary({ situation_actuelle: sa });
  const pure = pureSummary(sa);
  const aboPrimary = isAboPrimary(sa);
  const residualAbo = round2(summary.abonnements - pure.abonnements);
  const residualLoc = round2(summary.locations - pure.locations);

  if (residualAbo > 0.005) {
    if (aboPrimary) {
      ensureArray(sa, 'abonnements').push({
        libelle: SA_RESIDUAL_LABEL,
        tarif_net_mensuel: residualAbo,
        quantite: 1,
        _sa_uid: uid(),
        _sa_residual: true,
      });
    } else {
      // Pas d'abonnements → rester en régime basé-lignes (type 'autre' = compté).
      ensureArray(sa, 'lignes').push({
        type: 'autre',
        libelle: SA_RESIDUAL_LABEL,
        tarif_net_mensuel: residualAbo,
        quantite: 1,
        _sa_uid: uid(),
        _sa_residual: true,
      });
    }
  }
  if (residualLoc > 0.005) {
    ensureArray(sa, 'locations').push({
      libelle: SA_RESIDUAL_LABEL,
      loyer_net_mensuel: residualLoc,
      quantite: 1,
      _sa_uid: uid(),
      _sa_residual: true,
    });
  }

  // Charges variables connues seulement par leur total agrégé (`totaux.total_charges_variables_*`,
  // sans détail ligne à ligne) : on les matérialise, sinon `syncSources` les
  // remettrait à zéro en recalculant depuis les lignes.
  const hasChargeDetail = records(sa.charges_variables).some(
    (item) => pickMontant(item, CHARGE_PRICE_KEYS) > 0,
  );
  if (!hasChargeDetail && summary.chargesVariables > 0.005) {
    ensureArray(sa, 'charges_variables').push({
      libelle: SA_VARIABLE_AGGREGATE_LABEL,
      montant: summary.chargesVariables,
      precision_montant: 'HT',
      _sa_uid: uid(),
      _sa_residual: true,
    });
  }
}

/**
 * Recale toutes les valeurs dérivées sur la somme des lignes :
 *  - les ancres de réconciliation (sinon l'édition est annulée au recalcul) ;
 *  - les variables Word `total_abonnements` / `total_loyer_mensuel` /
 *    `total_materiel`, avec les mêmes formules que `enrichSituationActuelle`
 *    (app/api/propositions/extract/route.ts) pour que la proposition et les
 *    comparatifs SA/SP reflètent l'édition.
 */
function syncSources(sa: Record<string, unknown>): void {
  const pure = pureSummary(sa);
  if (!isRecord(sa.totaux)) sa.totaux = {};
  const totaux = sa.totaux as Record<string, unknown>;
  totaux.total_abonnements_source = pure.abonnements;
  totaux.total_abonnements_calcule = pure.abonnements;
  totaux.total_locations_source = pure.locations;
  totaux.total_locations_calcule = pure.locations;
  totaux.total_charges_variables_source = pure.chargesVariables;
  totaux.total_charges_variables_calcule = pure.chargesVariables;
  totaux.total_solution_actuelle_source = pure.totalMensuel;
  totaux.total_solution_actuelle_calcule = pure.totalMensuel;

  sa[CANONICAL_TOTAL_KEY] = pure.totalMensuel;
  sa.total_abonnements = round2(
    pure.lignesFixes + pure.lignesMobiles + pure.lignesInternet + pure.abonnements,
  );
  sa.total_loyer_mensuel = pure.totalMensuel;
  sa.total_materiel = pure.locations;
}

function addLine(sa: Record<string, unknown>, input: SaAddInput): void {
  const quantite = Math.max(1, Math.round(input.quantite) || 1);
  const montant = Math.max(0, input.montant) || 0;
  const designation = input.designation.trim() || DEFAULT_LABELS[input.section];
  const numero = (input.numero ?? '').trim();

  if (input.section === 'variable') {
    // Pas de quantité : `calculateSaCartSummary` ne multiplie pas les charges.
    ensureArray(sa, 'charges_variables').push({
      libelle: designation,
      type: 'autre',
      montant,
      precision_montant: 'HT',
      _sa_uid: uid(),
    });
    return;
  }

  if (input.section === 'location') {
    ensureArray(sa, 'locations').push({
      libelle: designation,
      numero_ligne: numero,
      quantite,
      loyer_net_mensuel: montant,
      _sa_uid: uid(),
    });
    return;
  }

  // Abonnement typé → toujours dans `lignes` (alimente les boucles SP).
  const linkUid = uid();
  ensureArray(sa, 'lignes').push({
    type: input.type ?? 'autre',
    libelle: designation,
    numero_ligne: numero,
    quantite,
    tarif_net_mensuel: montant,
    _sa_uid: uid(),
    _sa_line_uid: linkUid,
  });
  // En régime aboPrimary, la ligne ci-dessus est informative → on ajoute un item
  // `abonnements` lié pour que le montant soit bien compté dans le total.
  if (isAboPrimary(sa)) {
    ensureArray(sa, 'abonnements').push({
      libelle: designation,
      numero_ligne: numero,
      quantite,
      tarif_net_mensuel: montant,
      _sa_uid: uid(),
      _sa_line_uid: linkUid,
    });
  }
}

function resolveId(
  sa: Record<string, unknown>,
  id: string,
): { array: string; index: number } | null {
  for (const arrayName of ['abonnements', 'lignes', 'locations', 'charges_variables']) {
    if (id.startsWith(`${arrayName}:`)) {
      const index = Number(id.slice(arrayName.length + 1));
      const arr = rawArray(sa[arrayName]);
      return Number.isInteger(index) && index >= 0 && index < arr.length
        ? { array: arrayName, index }
        : null;
    }
  }
  if (id === 'aggregate:variable') {
    // Matérialisée par `materializeResiduals` juste avant la mutation.
    const cv = rawArray(sa.charges_variables).findIndex((it) => isRecord(it) && it._sa_residual === true);
    return cv >= 0 ? { array: 'charges_variables', index: cv } : null;
  }
  if (id === 'residual:abo') {
    const ab = rawArray(sa.abonnements).findIndex((it) => isRecord(it) && it._sa_residual === true);
    if (ab >= 0) return { array: 'abonnements', index: ab };
    const lg = rawArray(sa.lignes).findIndex((it) => isRecord(it) && it._sa_residual === true);
    if (lg >= 0) return { array: 'lignes', index: lg };
    return null;
  }
  if (id === 'residual:loc') {
    const lc = rawArray(sa.locations).findIndex((it) => isRecord(it) && it._sa_residual === true);
    return lc >= 0 ? { array: 'locations', index: lc } : null;
  }
  return null;
}

function applyPatchToItem(
  item: Record<string, unknown>,
  patch: SaLinePatch,
  array: string,
): void {
  const isCharge = array === 'charges_variables';
  if (patch.designation !== undefined) item.libelle = patch.designation;
  if (patch.numero !== undefined && !isCharge) item.numero_ligne = patch.numero;
  if (patch.quantite !== undefined && !isCharge) item.quantite = Math.max(1, Math.round(patch.quantite) || 1);
  if (patch.montant !== undefined) {
    const value = Math.max(0, patch.montant) || 0;
    if (array === 'locations') item.loyer_net_mensuel = value;
    else if (isCharge) {
      item.montant = value;
      // Les clés alternatives masqueraient la nouvelle valeur (`pickMontant`
      // ignore les montants nuls et passerait à la suivante).
      for (const key of CHARGE_PRICE_KEYS.slice(1)) delete item[key];
    } else item.tarif_net_mensuel = value;
  }
  // Une fois éditée, une ligne résiduelle devient une ligne normale.
  if (item._sa_residual === true) delete item._sa_residual;
}

function forEachTwin(
  sa: Record<string, unknown>,
  linkUid: unknown,
  exclude: { array: string; index: number },
  fn: (array: string, index: number) => void,
): void {
  if (typeof linkUid !== 'string' || !linkUid) return;
  for (const arrayName of ['lignes', 'abonnements']) {
    const arr = rawArray(sa[arrayName]);
    for (let i = 0; i < arr.length; i++) {
      if (arrayName === exclude.array && i === exclude.index) continue;
      const it = arr[i];
      if (isRecord(it) && it._sa_line_uid === linkUid) fn(arrayName, i);
    }
  }
}

function updateLine(sa: Record<string, unknown>, id: string, patch: SaLinePatch): void {
  const target = resolveId(sa, id);
  if (!target) return;
  const item = (sa[target.array] as unknown[])[target.index];
  if (!isRecord(item)) return;
  const linkUid = item._sa_line_uid;
  applyPatchToItem(item, patch, target.array);
  forEachTwin(sa, linkUid, target, (array, index) => {
    const twin = (sa[array] as unknown[])[index];
    if (isRecord(twin)) applyPatchToItem(twin, patch, array);
  });
}

function deleteLine(sa: Record<string, unknown>, id: string): void {
  const target = resolveId(sa, id);
  if (!target) return;
  const item = (sa[target.array] as unknown[])[target.index];
  const linkUid = isRecord(item) ? item._sa_line_uid : undefined;
  // Collecter d'abord toutes les positions à supprimer (jumelles incluses).
  const toRemove: Array<{ array: string; index: number }> = [{ ...target }];
  forEachTwin(sa, linkUid, target, (array, index) => toRemove.push({ array, index }));
  // Supprimer par index décroissant, array par array.
  for (const arrayName of ['abonnements', 'lignes', 'locations', 'charges_variables']) {
    const indexes = toRemove
      .filter((t) => t.array === arrayName)
      .map((t) => t.index)
      .sort((a, b) => b - a);
    const arr = sa[arrayName] as unknown[] | undefined;
    if (!Array.isArray(arr)) continue;
    for (const idx of indexes) arr.splice(idx, 1);
  }
}

/**
 * Applique une opération d'édition au panier SA et retourne le nouvel objet
 * `situation_actuelle` (immuable : l'entrée n'est pas modifiée).
 */
export function applySaEdit(
  situationActuelle: unknown,
  op: SaEditOp,
): Record<string, unknown> {
  const sa: Record<string, unknown> = isRecord(situationActuelle) ? clone(situationActuelle) : {};
  // 1. Matérialiser le résiduel pour préserver le montant non détaillé.
  materializeResiduals(sa);
  // 2. Appliquer la mutation.
  if (op.kind === 'add') addLine(sa, op.input);
  else if (op.kind === 'update') updateLine(sa, op.id, op.patch);
  else if (op.kind === 'delete') deleteLine(sa, op.id);
  // 3. Recaler les totaux « source » → le total suit la somme des lignes.
  syncSources(sa);
  return sa;
}
