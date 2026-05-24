import type { SpBareme, SpConfigLoyer, SpTauxDuree } from '@/types';

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

export const DEFAULT_CONFIG_LOYER: SpConfigLoyer = {
  baremes: [DEFAULT_BAREME],
};

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
 * Formule : loyer_mensuel = ceil((totalPonctuel + marge) × taux / 3)
 */
export function calculerLoyer(
  bareme: SpBareme | undefined | null,
  totalPonctuel: number,
  dureeMois: number,
  marge?: number,
): ResultatLoyer | null {
  const taux_durees = bareme?.taux_durees ?? DEFAULT_BAREME.taux_durees;
  const entry = taux_durees.find((t) => t.duree_mois === dureeMois);
  if (!entry) return null;

  const margeEffective = marge ?? 0;
  const base = totalPonctuel + margeEffective;
  const loyerMensuel = Math.ceil((base * entry.taux_loyer) / 3);

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
