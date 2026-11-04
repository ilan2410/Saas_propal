import type { SpLibelleKey, SpLibellesConfig } from '@/types';

export const SP_LIBELLES_DEFAUT: Record<SpLibelleKey, string> = {
  fixe: 'Fixe',
  mobile: 'Mobile',
  internet: 'Internet',
  autres_mensuels: 'Autres',
  total_mensuel: 'Total mensuel',
  montant_annee_lissee: 'Montant année lissée',
  materiel: 'Matériel',
  cadeaux: 'Cadeaux',
  installations: 'Installations',
  fas: 'FAS',
  autres_ponctuels: 'Autres',
  total_ponctuel: 'Total ponctuel',
  loyer_total_ponctuel: 'Total ponctuel',
  remise_mois_offert: 'Remise mois offert',
  indemnites: 'Indemnités',
  marge: 'Marge',
  base_loyer: 'Base loyer',
  loyer_mensuel: 'Mensuel',
  loyer_trimestriel: 'Trimestriel',
  montant_finance: 'Montant financé',
};

/** Lignes masquées tant qu'elles ne sont pas activées explicitement. */
const MASQUE_PAR_DEFAUT: ReadonlySet<SpLibelleKey> = new Set(['montant_finance', 'montant_annee_lissee']);

export const SP_LIBELLES_GROUPES: { titre: string; cles: SpLibelleKey[] }[] = [
  { titre: 'Abonnements', cles: ['fixe', 'mobile', 'internet', 'autres_mensuels', 'total_mensuel'] },
  {
    titre: 'Ponctuel',
    cles: ['materiel', 'cadeaux', 'installations', 'fas', 'autres_ponctuels', 'total_ponctuel'],
  },
  {
    titre: 'Loyer',
    cles: [
      'loyer_total_ponctuel',
      'remise_mois_offert',
      'indemnites',
      'marge',
      'base_loyer',
      'loyer_mensuel',
      'loyer_trimestriel',
      'montant_annee_lissee',
      'montant_finance',
    ],
  },
];

export function resolveLibelle(config: SpLibellesConfig | undefined, key: SpLibelleKey): string {
  const custom = config?.[key]?.label?.trim();
  return custom || SP_LIBELLES_DEFAUT[key];
}

export function isLibelleVisible(config: SpLibellesConfig | undefined, key: SpLibelleKey): boolean {
  return config?.[key]?.visible ?? !MASQUE_PAR_DEFAUT.has(key);
}
