export interface CalculetteMontants {
  mensuel: number;
  fraisFixes: number;
  penalites: number;
  fraisMateriel: number;
  servicesAnnexes: number;
}

export interface CalculetteFrais {
  fraisFixes: number;
  penalites: number;
  fraisMateriel: number;
  servicesAnnexes: number;
}

export interface CalculetteEngagement {
  libelle: string;
  mensuel: number;
  /** null = date de fin inconnue : les mensualités ne sont pas comptées. */
  moisRestants: number | null;
}

export interface CalculetteLigne {
  libelle: string;
  calcul: string | null;
  montant: number;
}

/** Durée d'engagement par défaut (mois) quand on part d'une date de début. */
export const DUREE_ENGAGEMENT_DEFAUT_MOIS = 63;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Ajoute `mois` à une date ISO (yyyy-mm-dd), en plafonnant au dernier jour du mois (31/01 + 1 = 28/02). */
export function addMonthsIso(iso: string, mois: number): string | null {
  const parsed = parseIso(iso);
  if (!parsed || !Number.isFinite(mois)) return null;
  const total = parsed.y * 12 + (parsed.m - 1) + Math.trunc(mois);
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return toIso(y, m, Math.min(parsed.d, lastDay));
}

/** Fin d'engagement = début + durée. La veille de l'anniversaire n'est pas retirée : la date saisie est reprise telle quelle. */
export function computeEngagementEnd(debutIso: string, dureeMois: number): string | null {
  if (!(dureeMois > 0)) return null;
  return addMonthsIso(debutIso, dureeMois);
}

/**
 * Nombre de mois COMPLETS entre deux dates ISO (négatif si `finIso` est avant `refIso`).
 * 22/09/2026 → 22/09/2027 = 12 ; 22/09/2026 → 21/09/2027 = 11.
 */
export function monthsBetweenIso(refIso: string, finIso: string): number | null {
  const a = parseIso(refIso);
  const b = parseIso(finIso);
  if (!a || !b) return null;
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return months;
}

export interface MoisRestantsResult {
  /** Mois complets jusqu'à la fin d'engagement (peut être négatif si la date est dépassée). */
  moisAvantPreavis: number;
  /** Mois facturables après déduction du préavis (≥ 0). */
  moisRestants: number;
  /** Date de fin dépassée. */
  depasse: boolean;
  /** Le préavis couvre tout ce qui reste : aucune mensualité due. */
  preavisCouvreTout: boolean;
}

export function computeMoisRestants(
  refIso: string,
  finIso: string,
  preavisMois: number,
): MoisRestantsResult | null {
  const avant = monthsBetweenIso(refIso, finIso);
  if (avant === null) return null;
  const preavis = Math.max(0, preavisMois);
  const depasse = avant < 0;
  return {
    moisAvantPreavis: avant,
    moisRestants: Math.max(0, avant - preavis),
    depasse,
    preavisCouvreTout: !depasse && preavis > 0 && avant <= preavis,
  };
}

function lignesFrais(frais: CalculetteFrais): CalculetteLigne[] {
  return ([
    ['Frais fixes de résiliation', frais.fraisFixes],
    ['Pénalités', frais.penalites],
    ['Frais matériel', frais.fraisMateriel],
    ['Services annexes', frais.servicesAnnexes],
  ] as const)
    .filter(([, montant]) => montant !== 0)
    .map(([libelle, montant]) => ({ libelle, calcul: null, montant }));
}

/** Calcul multi-engagements : chaque engagement apporte sa mensualité × ses mois restants. */
export function calculerIndemniteEngagements(
  engagements: CalculetteEngagement[],
  frais: CalculetteFrais,
) {
  const lignesEngagements: CalculetteLigne[] = engagements.flatMap((e) =>
    e.moisRestants === null || e.mensuel === 0
      ? []
      : [{
          libelle: engagements.length > 1 ? `Mensualités — ${e.libelle}` : 'Mensualités restantes',
          calcul: `${e.mensuel.toFixed(2)} € × ${e.moisRestants} mois`,
          montant: e.moisRestants * e.mensuel,
        }],
  );
  const lignes = [...lignesEngagements, ...lignesFrais(frais)];
  return {
    lignes,
    total: lignes.reduce((sum, ligne) => sum + ligne.montant, 0),
  };
}

/** Variante mono-engagement conservée pour compatibilité. */
export function calculerIndemnite(moisRestants: number | null, montants: CalculetteMontants) {
  const { mensuel, ...frais } = montants;
  const lignes = [
    ...(moisRestants === null ? [] : [{
      libelle: 'Mensualités restantes',
      calcul: `${mensuel.toFixed(2)} € × ${moisRestants} mois`,
      montant: moisRestants * mensuel,
    }]),
    ...lignesFrais(frais),
  ];

  return {
    lignes,
    total: (moisRestants ?? 0) * mensuel
      + frais.fraisFixes + frais.penalites + frais.fraisMateriel + frais.servicesAnnexes,
  };
}
