import type {
  SpBareme,
  SpComposantesBaseLoyer,
  SpConfigLoyer,
  SpFormuleLoyer,
  SpTauxDuree,
} from '@/types';

// ── Default config ───────────────────────────────────────────────────

export const DEFAULT_TAUX_DUREES: SpTauxDuree[] = [
  { duree_mois: 36, taux_loyer: 0.106, mois_offerts: 12, trimestres: 12 },
  { duree_mois: 48, taux_loyer: 0.081, mois_offerts: 18, trimestres: 16 },
  { duree_mois: 63, taux_loyer: 0.063, mois_offerts: 18, trimestres: 21 },
];

export const DEFAULT_BAREME: SpBareme = {
  id: 'default',
  nom: 'Barème par défaut',
  ordre: 0,
  taux_durees: DEFAULT_TAUX_DUREES,
};

export const DEFAULT_FORMULE_LOYER: SpFormuleLoyer = {
  diviseur: 3,
  arrondi: 'superieur',
  decimales: 0,
};

export const DEFAULT_COMPOSANTES_BASE_LOYER: SpComposantesBaseLoyer = {
  materiel: true,
  cadeaux: true,
  installations: true,
  fas: true,
  autres_ponctuels: true,
  mois_offerts: true,
  indemnites: true,
  marge: true,
};

export const DEFAULT_CONFIG_LOYER: SpConfigLoyer = {
  baremes: [DEFAULT_BAREME],
  duree_mois_par_defaut: 63,
  mois_offerts_actifs: true,
  formule: DEFAULT_FORMULE_LOYER,
  composantes_base: DEFAULT_COMPOSANTES_BASE_LOYER,
};

export interface ComposantesBaseLoyer {
  materiel: number;
  cadeaux: number;
  installations: number;
  fas: number;
  autres_ponctuels: number;
  mois_offerts: number;
  indemnites: number;
  marge: number;
}

export function calculerBaseLoyer(
  composantes: ComposantesBaseLoyer,
  config?: SpConfigLoyer,
): number {
  const inclusions = { ...DEFAULT_COMPOSANTES_BASE_LOYER, ...config?.composantes_base };
  if (config?.mois_offerts_actifs === false) inclusions.mois_offerts = false;
  return (Object.keys(inclusions) as Array<keyof SpComposantesBaseLoyer>)
    .reduce((total, key) => total + (inclusions[key] ? composantes[key] : 0), 0);
}

// ── Types résultat ───────────────────────────────────────────────────

export interface ResultatLoyer {
  loyer_mensuel: number;
  loyer_trimestriel: number;
  trimestres: number;
  mois_offerts: number;
  total_loyer: number;
  duree_mois: number;
  taux_utilise: number;
  marge_appliquee: number;
}

// ── Calculateur principal ────────────────────────────────────────────

/**
 * Calcule le loyer mensuel et trimestriel à partir du total ponctuel,
 * de la durée du contrat et d'une marge optionnelle.
 *
 * Formule : loyer_mensuel = arrondi((totalPonctuel + marge) × taux / diviseur)
 */
export function calculerLoyer(
  bareme: SpBareme | undefined | null,
  totalPonctuel: number,
  dureeMois: number,
  marge?: number,
  formuleConfig?: SpFormuleLoyer,
): ResultatLoyer | null {
  const taux_durees = bareme?.taux_durees ?? DEFAULT_BAREME.taux_durees;
  const entry = taux_durees.find((t) => t.duree_mois === dureeMois);
  if (!entry) return null;

  const margeEffective = marge ?? 0;
  const base = totalPonctuel + margeEffective;
  const formule = { ...DEFAULT_FORMULE_LOYER, ...formuleConfig };
  const diviseur = Number.isFinite(formule.diviseur) && formule.diviseur > 0 ? formule.diviseur : 3;
  const decimales = Math.min(4, Math.max(0, Math.trunc(formule.decimales)));
  const valeurBrute = (base * entry.taux_loyer) / diviseur;
  const precision = 10 ** decimales;
  const loyerMensuel = formule.arrondi === 'aucun'
    ? valeurBrute
    : formule.arrondi === 'inferieur'
      ? Math.floor(valeurBrute * precision) / precision
      : formule.arrondi === 'standard'
        ? Math.round(valeurBrute * precision) / precision
        : Math.ceil(valeurBrute * precision) / precision;

  return {
    loyer_mensuel: loyerMensuel,
    loyer_trimestriel: loyerMensuel * 3,
    trimestres: entry.trimestres,
    mois_offerts: entry.mois_offerts,
    total_loyer: loyerMensuel * entry.trimestres * 3,
    duree_mois: dureeMois,
    taux_utilise: entry.taux_loyer,
    marge_appliquee: margeEffective,
  };
}

// ── Calcul remise mois offert (package) ──────────────────────────────

/**
 * Calcule le montant de la remise "mois offerts" pour un package.
 * remise = total_recurrent_mensuel × mois_offerts
 */
export function calculerRemiseMoisOffert(
  bareme: SpBareme | undefined | null,
  totalRecurrentMensuel: number,
  dureeMois: number,
): number {
  const taux_durees = bareme?.taux_durees ?? DEFAULT_BAREME.taux_durees;
  const entry = taux_durees.find((t) => t.duree_mois === dureeMois);
  if (!entry) return 0;
  return totalRecurrentMensuel * entry.mois_offerts;
}

// ── Format helpers ───────────────────────────────────────────────────

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}
