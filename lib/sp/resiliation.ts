import type { SpConfigResiliation, SpConfigResiliationElements } from '@/types';

type UnknownRecord = Record<string, unknown>;

type ResiliationSourceRetenue = 'source' | 'estimation' | 'aucune';
type ResiliationComponentId =
  | 'mensualites_restantes'
  | 'frais_resiliation_fixes'
  | 'penalites'
  | 'frais_materiel'
  | 'services_annexes'
  | 'total';
type ResiliationProofCategory = 'engagement' | 'base_mensuelle' | 'frais' | 'source' | 'hypothese';
type ResiliationGroupType = 'service' | 'engagement';

export type SpResiliationFiabilite = 'forte' | 'moyenne' | 'faible' | 'insuffisante';

export interface SpResiliationComposant {
  id: ResiliationComponentId;
  label: string;
  montant: number | null;
  inclus: boolean;
  disponible: boolean;
  formule?: string;
}

export interface SpResiliationHypothese {
  label: string;
  valeur: string;
}

export interface SpResiliationPreuve {
  id: string;
  categorie: ResiliationProofCategory;
  label: string;
  valeur: string;
  contexte?: string;
  groupe_id?: string;
}

export interface SpResiliationGroupeCalcul {
  id: string;
  type: ResiliationGroupType;
  libelle: string;
  mois_restants: number | null;
  mois_avant_preavis: number | null;
  base_mensuelle: number | null;
  sous_total: number | null;
  methode: string;
  preuves: SpResiliationPreuve[];
}

export interface SpResiliationEstimation {
  montant_source: number | null;
  montant_estime: number | null;
  montant_retenu: number | null;
  source_retenue: ResiliationSourceRetenue;
  source_retenue_label: string;
  calcul_possible: boolean;
  fiabilite: SpResiliationFiabilite;
  explication_fiabilite: string;
  date_reference: string;
  mois_restants: number | null;
  mois_restants_avant_preavis: number | null;
  preavis_mois: number;
  base_mensuelle: number | null;
  mensualites_restantes: number | null;
  frais_resiliation_fixes: number;
  penalites: number;
  frais_materiel: number;
  services_annexes: number;
  methode_calcul: string;
  calcul_resume: string;
  details: string[];
  motifs_manquants: string[];
  composants: SpResiliationComposant[];
  hypotheses: SpResiliationHypothese[];
  preuves: SpResiliationPreuve[];
  groupes_calcul: SpResiliationGroupeCalcul[];
}

interface EngagementEvidence {
  id: string;
  libelle: string;
  contexte?: string;
  contractKey?: string;
  contractLabel?: string;
  engagementRef?: string;
  operateur?: string;
  site?: string;
  endDate: Date;
  endDateLabel: string;
  moisRestants: number;
  moisAvantPreavis: number;
}

interface MonthlyItemEvidence {
  label: string;
  contexte?: string;
  contractKey?: string;
  contractLabel?: string;
  engagementRef?: string;
  operateur?: string;
  site?: string;
  montant: number;
  endDate: Date | null;
  endDateLabel?: string;
  groupId: string;
  groupLabel: string;
}

export const DEFAULT_SP_CONFIG_RESILIATION: SpConfigResiliation = {
  utiliser_montant_source_si_disponible: true,
  preavis_mois_defaut: 3,
  elements_pris_en_compte: {
    lignes_mensuelles: true,
    abonnements_mensuels: true,
    locations_mensuelles: true,
    frais_resiliation_fixes: true,
    penalites: true,
    frais_materiel: true,
    services_annexes: true,
  },
};

function isRecord(value: unknown): value is UnknownRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeMoney(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return roundMoney(value);
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function parseFrenchDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = new Date(year, month, day);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseDateInput(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const fromFrench = parseFrenchDate(value);
  if (fromFrench) return fromFrench;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatFrenchDate(date: Date): string {
  return date.toLocaleDateString('fr-FR');
}

function formatMoney(value: number | null): string {
  if (value === null) return 'Non trouvé';
  return `${value.toFixed(2)} EUR`;
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function dedupeMonthlyItemKey(item: MonthlyItemEvidence): string {
  return `${normalizeLabel(item.label)}|${item.montant.toFixed(2)}`;
}

function isMonthlyItemOverlap(
  item: MonthlyItemEvidence,
  locationKeys: Set<string>,
  locationLabelsByAmount: Map<string, Set<string>>,
): boolean {
  const itemKey = dedupeMonthlyItemKey(item);
  if (locationKeys.has(itemKey)) return true;

  const amountKey = item.montant.toFixed(2);
  const labels = locationLabelsByAmount.get(amountKey);
  if (!labels) return false;

  const normalizedLabel = normalizeLabel(item.label);
  for (const locationLabel of labels) {
    if (normalizedLabel.includes(locationLabel) || locationLabel.includes(normalizedLabel)) return true;
  }
  return false;
}

function selectMonthlyItemsForResiliation(
  lineItems: MonthlyItemEvidence[],
  abonnementItems: MonthlyItemEvidence[],
  locationItems: MonthlyItemEvidence[],
): MonthlyItemEvidence[] {
  const abonnementPrimary = abonnementItems.length > 0;
  const locationKeys = new Set<string>();
  const locationLabelsByAmount = new Map<string, Set<string>>();

  locationItems.forEach((item) => {
    locationKeys.add(dedupeMonthlyItemKey(item));
    const amountKey = item.montant.toFixed(2);
    const labels = locationLabelsByAmount.get(amountKey) ?? new Set<string>();
    labels.add(normalizeLabel(item.label));
    locationLabelsByAmount.set(amountKey, labels);
  });

  const filteredAbonnements = abonnementItems.filter(
    (item) => !isMonthlyItemOverlap(item, locationKeys, locationLabelsByAmount),
  );

  return abonnementPrimary
    ? [...filteredAbonnements, ...locationItems]
    : [...lineItems, ...locationItems];
}

function normalizeComparableText(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return normalized || undefined;
}

function buildScopeKey(operateur?: string, site?: string): string | undefined {
  const normalizedOperateur = normalizeComparableText(operateur);
  const normalizedSite = normalizeComparableText(site);
  if (!normalizedOperateur && !normalizedSite) return undefined;
  return `${normalizedOperateur ?? 'sans-operateur'}|${normalizedSite ?? 'sans-site'}`;
}

function getContractMetadata(record: UnknownRecord): {
  contractKey?: string;
  contractLabel?: string;
  engagementRef?: string;
  operateur?: string;
  site?: string;
} {
  const referenceContrat = pickFirstText(record, ['reference_contrat', 'reference', 'contrat_reference']);
  const libelleContrat = pickFirstText(record, ['libelle_contrat', 'contrat', 'nom_contrat']);
  const engagementRef = pickFirstText(record, ['engagement_ref', 'reference_engagement', 'engagement_id']);
  const operateur = pickFirstText(record, ['operateur']);
  const site = pickFirstText(record, ['site']);
  const contractKey = normalizeComparableText(referenceContrat)
    ?? normalizeComparableText(engagementRef)
    ?? normalizeComparableText(libelleContrat);
  const contractLabel = libelleContrat ?? referenceContrat ?? engagementRef;

  return {
    contractKey,
    contractLabel: contractLabel ?? undefined,
    engagementRef: engagementRef ?? undefined,
    operateur: operateur ?? undefined,
    site: site ?? undefined,
  };
}

function monthDiff(referenceDate: Date, endDate: Date, preavisMois: number): number {
  const startValue = referenceDate.getFullYear() * 12 + referenceDate.getMonth();
  const endValue = endDate.getFullYear() * 12 + endDate.getMonth();
  return Math.max(0, endValue - startValue - preavisMois);
}

function monthDiffBeforePreavis(referenceDate: Date, endDate: Date): number {
  const startValue = referenceDate.getFullYear() * 12 + referenceDate.getMonth();
  const endValue = endDate.getFullYear() * 12 + endDate.getMonth();
  return Math.max(0, endValue - startValue);
}

function joinLabelParts(parts: Array<string | undefined | null>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' - ');
}

function pickFirstText(record: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function pickDateFromRecord(record: UnknownRecord): { date: Date | null; label?: string } {
  const raw =
    record.date_fin_engagement_source
    ?? record.date_fin_engagement
    ?? record.fin_engagement;
  const parsed = parseDateInput(raw);
  if (!parsed) return { date: null };
  const label = typeof raw === 'string' && raw.trim() ? raw.trim() : formatFrenchDate(parsed);
  return { date: parsed, label };
}

function pickPreavisMois(engagements: unknown, defaultPreavis: number): number {
  if (!Array.isArray(engagements)) return defaultPreavis;
  for (const engagement of engagements) {
    if (!isRecord(engagement)) continue;
    const value = normalizeInteger(engagement.preavis_mois);
    if (value !== null) return value;
  }
  return defaultPreavis;
}

function deriveMoisRestants(
  items: unknown,
  preavisMois: number,
  referenceDate: Date,
): { mois: number | null; moisAvantPreavis: number | null; heterogene: boolean; values: number[]; valuesAvantPreavis: number[] } {
  if (!Array.isArray(items)) return { mois: null, moisAvantPreavis: null, heterogene: false, values: [], valuesAvantPreavis: [] };
  const values: number[] = [];
  const valuesAvantPreavis: number[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const endDate = pickDateFromRecord(item).date;
    if (!endDate) continue;
    valuesAvantPreavis.push(monthDiffBeforePreavis(referenceDate, endDate));
    values.push(monthDiff(referenceDate, endDate, preavisMois));
  }
  if (values.length === 0) return { mois: null, moisAvantPreavis: null, heterogene: false, values: [], valuesAvantPreavis: [] };
  const unique = new Set(values);
  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  const averageAvantPreavis = Math.round(
    valuesAvantPreavis.reduce((sum, value) => sum + value, 0) / valuesAvantPreavis.length,
  );
  return { mois: average, moisAvantPreavis: averageAvantPreavis, heterogene: unique.size > 1, values, valuesAvantPreavis };
}

function buildElementsConfig(config?: SpConfigResiliation): Required<SpConfigResiliationElements> {
  return {
    lignes_mensuelles: config?.elements_pris_en_compte?.lignes_mensuelles ?? DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte?.lignes_mensuelles ?? true,
    abonnements_mensuels: config?.elements_pris_en_compte?.abonnements_mensuels ?? DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte?.abonnements_mensuels ?? true,
    locations_mensuelles: config?.elements_pris_en_compte?.locations_mensuelles ?? DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte?.locations_mensuelles ?? false,
    frais_resiliation_fixes: config?.elements_pris_en_compte?.frais_resiliation_fixes ?? DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte?.frais_resiliation_fixes ?? true,
    penalites: config?.elements_pris_en_compte?.penalites ?? DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte?.penalites ?? true,
    frais_materiel: config?.elements_pris_en_compte?.frais_materiel ?? DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte?.frais_materiel ?? true,
    services_annexes: config?.elements_pris_en_compte?.services_annexes ?? DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte?.services_annexes ?? true,
  };
}

function buildEngagementEvidences(
  engagements: unknown,
  referenceDate: Date,
  preavisMois: number,
): EngagementEvidence[] {
  if (!Array.isArray(engagements)) return [];
  const result: EngagementEvidence[] = [];

  engagements.forEach((engagement, index) => {
    if (!isRecord(engagement)) return;
    const pickedDate = pickDateFromRecord(engagement);
    if (!pickedDate.date || !pickedDate.label) return;
    const contractMeta = getContractMetadata(engagement);
    const libelle = pickFirstText(engagement, ['libelle', 'contrat', 'nom']) ?? `Engagement ${index + 1}`;
    const contexte = joinLabelParts([
      contractMeta.operateur,
      contractMeta.site,
    ]);
    result.push({
      id: `engagement_${index}`,
      libelle,
      contexte: contexte || undefined,
      contractKey: contractMeta.contractKey,
      contractLabel: contractMeta.contractLabel,
      engagementRef: contractMeta.engagementRef,
      operateur: contractMeta.operateur,
      site: contractMeta.site,
      endDate: pickedDate.date,
      endDateLabel: pickedDate.label,
      moisRestants: monthDiff(referenceDate, pickedDate.date, preavisMois),
      moisAvantPreavis: monthDiffBeforePreavis(referenceDate, pickedDate.date),
    });
  });

  return result;
}

function collectMonthlyItems(
  items: unknown,
  kind: 'ligne' | 'abonnement' | 'location',
  amountKeys: string[],
): MonthlyItemEvidence[] {
  if (!Array.isArray(items)) return [];
  const output: MonthlyItemEvidence[] = [];

  items.forEach((item) => {
    if (!isRecord(item)) return;
    const amount = amountKeys
      .map((key) => normalizeMoney(item[key]))
      .find((value): value is number => value !== null);
    if (amount === undefined) return;
    const contractMeta = getContractMetadata(item);

    let label = 'Service';
    let contexte = '';
    let groupLabel = 'Services';
    let groupId = `${kind}:services`;

    if (kind === 'ligne') {
      const numero = pickFirstText(item, ['numero_ligne', 'numero']);
      const forfait = pickFirstText(item, ['forfait', 'libelle']);
      const type = pickFirstText(item, ['type']) ?? 'ligne';
      const operateur = contractMeta.operateur;
      const site = contractMeta.site;
      label = joinLabelParts([numero, forfait]) || 'Ligne';
      contexte = joinLabelParts([type, operateur, site]);
      groupLabel = joinLabelParts([
        `Lignes ${type.toLowerCase()}${type.toLowerCase().endsWith('s') ? '' : 's'}`,
        operateur,
        site,
      ]) || 'Lignes';
      groupId = `ligne:${type.toLowerCase()}:${(operateur ?? 'sans-operateur').toLowerCase()}:${(site ?? 'sans-site').toLowerCase()}`;
    }

    if (kind === 'abonnement') {
      const libelle = pickFirstText(item, ['libelle', 'forfait']);
      const operateur = contractMeta.operateur;
      const site = contractMeta.site;
      label = libelle ?? 'Abonnement';
      contexte = joinLabelParts([operateur, site]);
      groupLabel = joinLabelParts(['Abonnements', operateur, site]) || 'Abonnements';
      groupId = `abonnement:${(operateur ?? 'sans-operateur').toLowerCase()}:${(site ?? 'sans-site').toLowerCase()}`;
    }

    if (kind === 'location') {
      const libelle = pickFirstText(item, ['materiel', 'libelle', 'nom']);
      const leaser = pickFirstText(item, ['leaser']);
      const site = contractMeta.site;
      label = libelle ?? 'Location';
      contexte = joinLabelParts([leaser, site]);
      groupLabel = joinLabelParts(['Locations', leaser, site]) || 'Locations';
      groupId = `location:${(leaser ?? 'sans-leaser').toLowerCase()}:${(site ?? 'sans-site').toLowerCase()}`;
    }

    const pickedDate = pickDateFromRecord(item);
    output.push({
      label,
      contexte: contexte || undefined,
      contractKey: contractMeta.contractKey,
      contractLabel: contractMeta.contractLabel,
      engagementRef: contractMeta.engagementRef,
      operateur: contractMeta.operateur,
      site: contractMeta.site,
      montant: amount,
      endDate: pickedDate.date,
      endDateLabel: pickedDate.label,
      groupId,
      groupLabel,
    });
  });

  return output;
}

function buildGroupCalculations(
  monthlyItems: MonthlyItemEvidence[],
  engagements: EngagementEvidence[],
  referenceDate: Date,
  globalMoisRestants: number | null,
  preavisMois: number,
): SpResiliationGroupeCalcul[] {
  const engagementByContractKey = new Map<string, EngagementEvidence>();
  const engagementByReference = new Map<string, EngagementEvidence>();
  const engagementByScope = new Map<string, EngagementEvidence[]>();
  engagements.forEach((engagement) => {
    if (engagement.contractKey) engagementByContractKey.set(engagement.contractKey, engagement);
    if (engagement.engagementRef) {
      const normalizedRef = normalizeComparableText(engagement.engagementRef);
      if (normalizedRef) engagementByReference.set(normalizedRef, engagement);
    }
    const scopeKey = buildScopeKey(engagement.operateur, engagement.site);
    if (scopeKey) {
      const scoped = engagementByScope.get(scopeKey) ?? [];
      scoped.push(engagement);
      engagementByScope.set(scopeKey, scoped);
    }
  });

  type GroupBucket = {
    id: string;
    label: string;
    type: ResiliationGroupType;
    items: MonthlyItemEvidence[];
    engagement?: EngagementEvidence;
  };

  const groupMap = new Map<string, GroupBucket>();
  monthlyItems.forEach((item) => {
    const normalizedItemRef = normalizeComparableText(item.engagementRef);
    const scopeKey = buildScopeKey(item.operateur, item.site);
    const scopedEngagements = scopeKey ? engagementByScope.get(scopeKey) ?? [] : [];
    const matchedEngagement =
      (item.contractKey ? engagementByContractKey.get(item.contractKey) : undefined)
      ?? (normalizedItemRef ? engagementByReference.get(normalizedItemRef) : undefined)
      ?? (scopedEngagements.length === 1 ? scopedEngagements[0] : undefined);

    const resolvedGroupId = matchedEngagement?.contractKey
      ? `contrat:${matchedEngagement.contractKey}`
      : item.contractKey
        ? `contrat:${item.contractKey}`
        : matchedEngagement?.id ?? item.groupId;
    const resolvedLabel =
      matchedEngagement?.contractLabel
      ?? matchedEngagement?.libelle
      ?? item.contractLabel
      ?? item.groupLabel;
    const resolvedType: ResiliationGroupType =
      matchedEngagement?.contractKey || item.contractKey ? 'engagement' : 'service';

    const current = groupMap.get(resolvedGroupId) ?? {
      id: resolvedGroupId,
      label: resolvedLabel,
      type: resolvedType,
      items: [],
      engagement: matchedEngagement,
    };
    current.items.push(item);
    if (!current.engagement && matchedEngagement) current.engagement = matchedEngagement;
    if (!current.label && resolvedLabel) current.label = resolvedLabel;
    groupMap.set(resolvedGroupId, current);
  });

  const groups: SpResiliationGroupeCalcul[] = [];

  for (const [groupId, bucket] of groupMap.entries()) {
    const items = bucket.items;
    const baseMensuelle = roundMoney(items.reduce((sum, item) => sum + item.montant, 0));
    const datedItems = items.filter((item) => item.endDate);
    const moisValues = datedItems
      .map((item) => (item.endDate ? monthDiff(referenceDate, item.endDate, preavisMois) : null))
      .filter((value): value is number => value !== null);
    const moisValuesAvantPreavis = datedItems
      .map((item) => (item.endDate ? monthDiffBeforePreavis(referenceDate, item.endDate) : null))
      .filter((value): value is number => value !== null);
    const moisRestants = moisValues.length > 0
      ? Math.round(moisValues.reduce((sum, value) => sum + value, 0) / moisValues.length)
      : bucket.engagement?.moisRestants ?? globalMoisRestants;
    const moisAvantPreavis = moisValuesAvantPreavis.length > 0
      ? Math.round(moisValuesAvantPreavis.reduce((sum, value) => sum + value, 0) / moisValuesAvantPreavis.length)
      : bucket.engagement?.moisAvantPreavis ?? (moisRestants !== null ? moisRestants + preavisMois : null);
    const sousTotal = moisRestants !== null ? roundMoney(baseMensuelle * moisRestants) : null;

    groups.push({
      id: groupId,
      type: bucket.type,
      libelle: bucket.label || items[0]?.groupLabel || 'Groupe',
      mois_restants: moisRestants,
      mois_avant_preavis: moisAvantPreavis,
      base_mensuelle: baseMensuelle,
      sous_total: sousTotal,
      methode: bucket.engagement?.contractLabel
        ? `${bucket.engagement.contractLabel}: ${moisRestants !== null ? `${moisRestants} mois restants${moisAvantPreavis !== null ? ` (${moisAvantPreavis} - ${preavisMois} de preavis)` : ''} x ${formatMoney(baseMensuelle)}` : `base mensuelle ${formatMoney(baseMensuelle)}`}`
        : moisRestants !== null
          ? `${moisRestants} mois restants${moisAvantPreavis !== null ? ` (${moisAvantPreavis} - ${preavisMois} de preavis)` : ''} x ${formatMoney(baseMensuelle)}`
          : `Base mensuelle ${formatMoney(baseMensuelle)} sans mois restants fiables`,
      preuves: [
        ...(bucket.engagement ? [{
          id: `${groupId}_engagement`,
          categorie: 'engagement' as const,
          label: bucket.engagement.contractLabel ?? bucket.engagement.libelle,
          valeur: bucket.engagement.endDateLabel,
          contexte: joinLabelParts([
            `${bucket.engagement.moisRestants} mois restants (${bucket.engagement.moisAvantPreavis} - ${preavisMois} de preavis)`,
            bucket.engagement.engagementRef ? `engagement ${bucket.engagement.engagementRef}` : null,
            bucket.engagement.contexte,
          ]) || undefined,
          groupe_id: groupId,
        }] : []),
        ...items.map((item, index) => ({
          id: `${groupId}_preuve_${index}`,
          categorie: 'base_mensuelle' as const,
          label: item.label,
          valeur: `${formatMoney(item.montant)} / mois`,
          contexte: joinLabelParts([
            item.contractLabel,
            item.contexte,
            item.endDateLabel ? `fin d'engagement ${item.endDateLabel}` : null,
          ]) || undefined,
          groupe_id: groupId,
        })),
      ],
    });
  }

  engagements.forEach((engagement) => {
    const standaloneGroupId = engagement.contractKey ? `contrat:${engagement.contractKey}` : engagement.id;
    if (groups.some((group) => group.id === standaloneGroupId || group.libelle === (engagement.contractLabel ?? engagement.libelle))) return;
    groups.push({
      id: standaloneGroupId,
      type: 'engagement',
      libelle: engagement.contractLabel ?? engagement.libelle,
      mois_restants: engagement.moisRestants,
      mois_avant_preavis: engagement.moisAvantPreavis,
      base_mensuelle: null,
      sous_total: null,
      methode: engagement.engagementRef
        ? `Engagement ${engagement.engagementRef} - fin lue au ${engagement.endDateLabel}`
        : `Fin d'engagement lue au ${engagement.endDateLabel}`,
      preuves: [
        {
          id: `${standaloneGroupId}_fin`,
          categorie: 'engagement',
          label: engagement.contractLabel ?? 'Fin d\'engagement',
          valeur: engagement.endDateLabel,
          contexte: joinLabelParts([
            `${engagement.moisRestants} mois restants (${engagement.moisAvantPreavis} - ${preavisMois} de preavis)`,
            engagement.engagementRef ? `engagement ${engagement.engagementRef}` : null,
            engagement.contexte,
          ]) || undefined,
          groupe_id: standaloneGroupId,
        },
      ],
    });
  });

  return groups.sort((a, b) => (b.sous_total ?? 0) - (a.sous_total ?? 0));
}

function explainSourceRetenue(sourceRetenue: ResiliationSourceRetenue): string {
  switch (sourceRetenue) {
    case 'source':
      return 'Montant source SA';
    case 'estimation':
      return 'Estimation automatique';
    default:
      return 'Aucune source exploitable';
  }
}

function explainFiabilite(
  fiabilite: SpResiliationFiabilite,
  sourceRetenue: ResiliationSourceRetenue,
  motifsManquants: string[],
  moisDerivesHeterogenes: boolean,
): string {
  if (sourceRetenue === 'source') {
    return 'Fiabilité forte car un montant explicite d\'indemnité est déjà présent dans la situation actuelle.';
  }
  if (fiabilite === 'moyenne') {
    return moisDerivesHeterogenes
      ? 'Fiabilité moyenne car le montant est calculé automatiquement, avec des engagements hétérogènes selon les services.'
      : 'Fiabilité moyenne car le montant est calculé automatiquement à partir des engagements et de la base mensuelle détectée.';
  }
  if (fiabilite === 'faible') {
    return motifsManquants.length > 0
      ? `Fiabilité faible car certaines données sont manquantes: ${motifsManquants.join(', ')}.`
      : 'Fiabilité faible car le calcul repose sur une estimation partielle.';
  }
  return 'Fiabilité insuffisante car la situation actuelle ne fournit pas assez d\'éléments pour une estimation crédible.';
}

function resolveReferenceDate(
  indemnites: UnknownRecord,
  referenceDateInput?: Date | string | null,
): Date {
  const fromInput = parseDateInput(referenceDateInput);
  if (fromInput) return fromInput;
  const fromData = parseDateInput(indemnites.date_reference_calculee);
  if (fromData) return fromData;
  return new Date();
}

export function estimateResiliationFromSA(
  rawData: unknown,
  config?: SpConfigResiliation,
  referenceDateInput?: Date | string | null,
): SpResiliationEstimation {
  const root = isRecord(rawData) ? rawData : {};
  const situation = isRecord(root.situation_actuelle) ? root.situation_actuelle : root;
  const indemnites = isRecord(situation.indemnites) ? situation.indemnites : {};
  const elements = buildElementsConfig(config);
  const referenceDate = resolveReferenceDate(indemnites, referenceDateInput);
  const referenceDateLabel = formatFrenchDate(referenceDate);
  const preavisMois = Math.max(
    0,
    normalizeInteger(indemnites.preavis_mois_source)
      ?? pickPreavisMois(situation.engagements, config?.preavis_mois_defaut ?? DEFAULT_SP_CONFIG_RESILIATION.preavis_mois_defaut ?? 3),
  );

  const montantSource = normalizeMoney(indemnites.montant_source);
  const engagementEvidences = buildEngagementEvidences(situation.engagements, referenceDate, preavisMois);
  const moisRestantsSource = normalizeInteger(indemnites.mois_restants_source);
  const moisDerives = deriveMoisRestants(situation.engagements, preavisMois, referenceDate);
  const moisRestants = moisDerives.mois ?? moisRestantsSource;
  const moisRestantsAvantPreavis = moisDerives.moisAvantPreavis ?? (moisRestants !== null ? moisRestants + preavisMois : null);

  const lineItems = elements.lignes_mensuelles
    ? collectMonthlyItems(situation.lignes, 'ligne', ['tarif_net_mensuel', 'tarif_brut_mensuel', 'tarif'])
    : [];
  const abonnementItems = elements.abonnements_mensuels
    ? collectMonthlyItems(situation.abonnements, 'abonnement', ['tarif_net_mensuel', 'tarif_brut_mensuel', 'tarif'])
    : [];
  const locationItems = elements.locations_mensuelles
    ? collectMonthlyItems(situation.locations, 'location', ['loyer_net_mensuel', 'loyer_brut_mensuel', 'tarif'])
    : [];
  const monthlyItems = selectMonthlyItemsForResiliation(lineItems, abonnementItems, locationItems);

  const baseMensuelleSource = normalizeMoney(indemnites.base_mensuelle_source);
  const baseMensuelleCalculee = monthlyItems.length > 0
    ? roundMoney(monthlyItems.reduce((sum, item) => sum + item.montant, 0))
    : null;
  const baseMensuelle = baseMensuelleCalculee ?? baseMensuelleSource;

  const groupesCalcul = buildGroupCalculations(monthlyItems, engagementEvidences, referenceDate, moisRestants, preavisMois);
  const groupedMensualitesAvailable = groupesCalcul.some((group) => group.sous_total !== null);
  const groupedMensualites = groupedMensualitesAvailable
    ? roundMoney(
        groupesCalcul.reduce((sum, group) => sum + (group.sous_total ?? 0), 0),
      )
    : null;

  const fraisResiliationFixesSource = normalizeMoney(indemnites.frais_resiliation_fixes);
  const penalitesSource = normalizeMoney(indemnites.penalites);
  const fraisMaterielSource = normalizeMoney(indemnites.frais_materiel);
  const servicesAnnexesSource = normalizeMoney(indemnites.services_annexes);

  const fraisResiliationFixes = elements.frais_resiliation_fixes ? fraisResiliationFixesSource ?? 0 : 0;
  const penalites = elements.penalites ? penalitesSource ?? 0 : 0;
  const fraisMateriel = elements.frais_materiel ? fraisMaterielSource ?? 0 : 0;
  const servicesAnnexes = elements.services_annexes ? servicesAnnexesSource ?? 0 : 0;

  const mensualitesRestantes =
    groupedMensualites !== null
      ? groupedMensualites
      : moisRestants !== null && baseMensuelle !== null
      ? roundMoney(moisRestants * baseMensuelle)
      : null;

  const estimableValues: number[] = [];
  if (mensualitesRestantes !== null) estimableValues.push(mensualitesRestantes);
  if (elements.frais_resiliation_fixes && fraisResiliationFixesSource !== null) estimableValues.push(fraisResiliationFixes);
  if (elements.penalites && penalitesSource !== null) estimableValues.push(penalites);
  if (elements.frais_materiel && fraisMaterielSource !== null) estimableValues.push(fraisMateriel);
  if (elements.services_annexes && servicesAnnexesSource !== null) estimableValues.push(servicesAnnexes);
  const montantEstime = estimableValues.length > 0
    ? roundMoney(estimableValues.reduce((sum, value) => sum + value, 0))
    : null;

  const useSource = (config?.utiliser_montant_source_si_disponible ?? DEFAULT_SP_CONFIG_RESILIATION.utiliser_montant_source_si_disponible) === true
    && montantSource !== null;
  const montantRetenu = useSource ? montantSource : (montantEstime ?? montantSource);
  const sourceRetenue: ResiliationSourceRetenue = useSource
    ? 'source'
    : montantEstime !== null
      ? 'estimation'
      : montantSource !== null
        ? 'source'
        : 'aucune';

  const motifsManquants: string[] = [];
  if (moisRestants === null && (elements.lignes_mensuelles || elements.abonnements_mensuels || elements.locations_mensuelles)) {
    motifsManquants.push('mois restants non déterminés');
  }
  if (baseMensuelle === null && (elements.lignes_mensuelles || elements.abonnements_mensuels || elements.locations_mensuelles)) {
    motifsManquants.push('base mensuelle non déterminée');
  }
  if (montantSource === null) {
    motifsManquants.push('montant contractuel d\'indemnité non trouvé');
  }
  if (elements.frais_resiliation_fixes && fraisResiliationFixesSource === null) {
    motifsManquants.push('frais fixes non trouvés');
  }
  if (elements.penalites && penalitesSource === null) {
    motifsManquants.push('pénalités non trouvées');
  }
  if (elements.frais_materiel && fraisMaterielSource === null) {
    motifsManquants.push('frais matériel non trouvés');
  }
  if (elements.services_annexes && servicesAnnexesSource === null) {
    motifsManquants.push('services annexes non trouvés');
  }

  let fiabilite: SpResiliationFiabilite = 'insuffisante';
  if (sourceRetenue === 'source') {
    fiabilite = 'forte';
  } else if (montantEstime !== null && moisRestants !== null && baseMensuelle !== null) {
    fiabilite = moisDerives.heterogene ? 'faible' : 'moyenne';
  } else if (montantEstime !== null) {
    fiabilite = 'faible';
  }

  const composants: SpResiliationComposant[] = [
    {
      id: 'mensualites_restantes',
      label: 'Mensualités restantes',
      montant: mensualitesRestantes,
      inclus: elements.lignes_mensuelles || elements.abonnements_mensuels || elements.locations_mensuelles,
      disponible: mensualitesRestantes !== null,
      formule: groupedMensualites !== null
        ? 'Somme des sous-totaux par groupe engage'
        : mensualitesRestantes !== null && moisRestants !== null && baseMensuelle !== null
        ? `${moisRestants} mois restants${moisRestantsAvantPreavis !== null ? ` (${moisRestantsAvantPreavis} - ${preavisMois} de preavis)` : ''} x ${formatMoney(baseMensuelle)}`
        : undefined,
    },
    {
      id: 'frais_resiliation_fixes',
      label: 'Frais fixes de résiliation',
      montant: fraisResiliationFixes,
      inclus: elements.frais_resiliation_fixes,
      disponible: fraisResiliationFixesSource !== null,
    },
    {
      id: 'penalites',
      label: 'Pénalités',
      montant: penalites,
      inclus: elements.penalites,
      disponible: penalitesSource !== null,
    },
    {
      id: 'frais_materiel',
      label: 'Frais matériel',
      montant: fraisMateriel,
      inclus: elements.frais_materiel,
      disponible: fraisMaterielSource !== null,
    },
    {
      id: 'services_annexes',
      label: 'Services annexes',
      montant: servicesAnnexes,
      inclus: elements.services_annexes,
      disponible: servicesAnnexesSource !== null,
    },
    {
      id: 'total',
      label: 'Total estimé',
      montant: montantEstime,
      inclus: true,
      disponible: montantEstime !== null,
    },
  ];

  const hypotheses: SpResiliationHypothese[] = [
    { label: 'Date de référence', valeur: referenceDateLabel },
    { label: 'Préavis retenu', valeur: `${preavisMois} mois` },
    {
      label: 'Éléments inclus',
      valeur: [
        elements.lignes_mensuelles ? 'lignes' : null,
        elements.abonnements_mensuels ? 'abonnements' : null,
        elements.locations_mensuelles ? 'locations' : null,
        elements.frais_resiliation_fixes ? 'frais fixes' : null,
        elements.penalites ? 'pénalités' : null,
        elements.frais_materiel ? 'frais matériel' : null,
        elements.services_annexes ? 'services annexes' : null,
      ].filter(Boolean).join(', ') || 'aucun',
    },
    {
      label: 'Montant source prioritaire',
      valeur: useSource ? 'oui' : 'non',
    },
  ];

  const preuves: SpResiliationPreuve[] = [];
  if (montantSource !== null) {
    preuves.push({
      id: 'montant_source',
      categorie: 'source',
      label: 'Montant d\'indemnité lu',
      valeur: formatMoney(montantSource),
      contexte: 'Montant déjà présent dans la situation actuelle',
    });
  }
  engagementEvidences.forEach((engagement) => {
    preuves.push({
      id: `${engagement.id}_date`,
      categorie: 'engagement',
      label: `Fin d'engagement - ${engagement.libelle}`,
      valeur: engagement.endDateLabel,
      contexte: joinLabelParts([
        engagement.contexte,
        `${engagement.moisRestants} mois restants (${engagement.moisAvantPreavis} - ${preavisMois} de preavis)`,
      ]) || undefined,
      groupe_id: engagement.id,
    });
  });
  monthlyItems.forEach((item, index) => {
    preuves.push({
      id: `base_${index}`,
      categorie: 'base_mensuelle',
      label: item.label,
      valeur: `${formatMoney(item.montant)} / mois`,
      contexte: joinLabelParts([
        item.contexte,
        item.endDateLabel ? `fin d'engagement ${item.endDateLabel}` : null,
      ]) || undefined,
      groupe_id: item.groupId,
    });
  });
  if (elements.frais_resiliation_fixes && fraisResiliationFixesSource !== null) {
    preuves.push({
      id: 'preuve_frais_fixes',
      categorie: 'frais',
      label: 'Frais fixes de résiliation',
      valeur: formatMoney(fraisResiliationFixes),
    });
  }
  if (elements.penalites && penalitesSource !== null) {
    preuves.push({
      id: 'preuve_penalites',
      categorie: 'frais',
      label: 'Pénalités',
      valeur: formatMoney(penalites),
    });
  }
  if (elements.frais_materiel && fraisMaterielSource !== null) {
    preuves.push({
      id: 'preuve_frais_materiel',
      categorie: 'frais',
      label: 'Frais matériel',
      valeur: formatMoney(fraisMateriel),
    });
  }
  if (elements.services_annexes && servicesAnnexesSource !== null) {
    preuves.push({
      id: 'preuve_services_annexes',
      categorie: 'frais',
      label: 'Services annexes',
      valeur: formatMoney(servicesAnnexes),
    });
  }

  const details: string[] = [];
  details.push(`Date de référence figée: ${referenceDateLabel}`);
  details.push(`Source retenue: ${explainSourceRetenue(sourceRetenue)}`);
  if (groupedMensualites !== null) {
    details.push(`Mensualités restantes: somme des groupes engagés = ${formatMoney(groupedMensualites)}`);
  } else if (mensualitesRestantes !== null && moisRestants !== null && baseMensuelle !== null) {
    details.push(`Mensualités restantes: ${moisRestants} mois restants${moisRestantsAvantPreavis !== null ? ` (${moisRestantsAvantPreavis} - ${preavisMois} de preavis)` : ''} x ${formatMoney(baseMensuelle)} = ${formatMoney(mensualitesRestantes)}`);
  }
  if (elements.frais_resiliation_fixes) details.push(`Frais fixes: ${formatMoney(fraisResiliationFixesSource ?? 0)}`);
  if (elements.penalites) details.push(`Pénalités: ${formatMoney(penalitesSource ?? 0)}`);
  if (elements.frais_materiel) details.push(`Frais matériel: ${formatMoney(fraisMaterielSource ?? 0)}`);
  if (elements.services_annexes) details.push(`Services annexes: ${formatMoney(servicesAnnexesSource ?? 0)}`);

  const calculResume = montantRetenu === null
    ? 'Aucune estimation disponible'
    : sourceRetenue === 'source'
      ? `${formatMoney(montantRetenu)} retenus depuis la situation actuelle`
      : groupedMensualites !== null
        ? `${groupesCalcul.filter((group) => group.sous_total !== null).length} groupe(s) engagé(s) + frais complémentaires`
        : mensualitesRestantes !== null && moisRestants !== null && baseMensuelle !== null
        ? `${moisRestants} mois x ${formatMoney(baseMensuelle)}${estimableValues.length > 1 ? ' + frais complémentaires' : ''}`
        : 'Estimation partielle depuis la situation actuelle';

  const methodeCalcul = montantRetenu === null
    ? 'Aucune estimation disponible'
    : sourceRetenue === 'source'
      ? 'Montant lu dans la situation actuelle'
      : `${composants
          .filter((component) => component.id !== 'total' && component.inclus && component.disponible)
          .map((component) => component.formule ? `${component.label}: ${component.formule}` : `${component.label}: ${formatMoney(component.montant)}`)
          .join(' + ') || 'Estimation rapide depuis la situation actuelle'}`;

  return {
    montant_source: montantSource,
    montant_estime: montantEstime,
    montant_retenu: montantRetenu,
    source_retenue: sourceRetenue,
    source_retenue_label: explainSourceRetenue(sourceRetenue),
    calcul_possible: montantEstime !== null,
    fiabilite,
    explication_fiabilite: explainFiabilite(fiabilite, sourceRetenue, motifsManquants, moisDerives.heterogene),
    date_reference: referenceDateLabel,
    mois_restants: moisRestants,
    mois_restants_avant_preavis: moisRestantsAvantPreavis,
    preavis_mois: preavisMois,
    base_mensuelle: baseMensuelle,
    mensualites_restantes: mensualitesRestantes,
    frais_resiliation_fixes: fraisResiliationFixes,
    penalites,
    frais_materiel: fraisMateriel,
    services_annexes: servicesAnnexes,
    methode_calcul: methodeCalcul,
    calcul_resume: calculResume,
    details,
    motifs_manquants: motifsManquants,
    composants,
    hypotheses,
    preuves,
    groupes_calcul: groupesCalcul,
  };
}
