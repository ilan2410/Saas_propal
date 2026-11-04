import type { SpConfigLoyer, SpMargeOperande, SpMargeOperateur, SpQuestionReponse } from '@/types';
import type { SpCartSummary } from './calculateCart';
import { calculerMontantAnneeLissee, calculerMontantFinance } from './calculLoyer';

type SpMargeInputs = Pick<
  SpCartSummary,
  'totalPonctuel' | 'remiseMoisOffert' | 'indemnites' | 'baseLoyer' | 'loyer' | 'abonnements'
>;

export const MARGE_OPERANDES: SpMargeOperande[] = [
  'loyer_total_ponctuel', 'remise_mois_offert', 'indemnites',
  'montant_annee_lissee', 'base_loyer', 'loyer_mensuel',
  'loyer_trimestriel', 'montant_finance',
];

export const MARGE_OPERANDES_CIRCULAIRES: SpMargeOperande[] = [
  'base_loyer', 'loyer_mensuel', 'loyer_trimestriel', 'montant_finance',
];

export const MARGE_FORMULE_DEFAUT = {
  operandes: ['montant_finance', 'base_loyer'] as SpMargeOperande[],
  operateurs: ['-'] as SpMargeOperateur[],
};

export function validerFormuleMarge(config: SpConfigLoyer): string | null {
  if (config.widget_marge?.mode !== 'automatique') return null;
  const { operandes, operateurs } = config.widget_marge;
  if (!operandes?.length || !operateurs || operateurs.length !== operandes.length - 1 ||
    operandes.some((key) => !MARGE_OPERANDES.includes(key)) ||
    operateurs.some((op) => !['+', '-', '*', '/'].includes(op))) {
    return 'La formule de marge est incomplète ou invalide.';
  }
  if (config.composantes_base?.marge !== false &&
    operandes.some((key) => MARGE_OPERANDES_CIRCULAIRES.includes(key))) {
    return 'Décochez « Marge » dans la base financée ou retirez les champs dépendant du loyer de la formule.';
  }
  return null;
}

export function calculerMargeAuto(
  summary: SpMargeInputs,
  config: SpConfigLoyer,
): { valeur: number | null; erreur: string | null } {
  const erreur = validerFormuleMarge(config);
  if (erreur) return { valeur: null, erreur };
  const { operandes = [], operateurs = [] } = config.widget_marge ?? {};
  const montantFinance = calculerMontantFinance(summary.loyer, config.formule);
  const valeurs: Record<SpMargeOperande, number | null> = {
    loyer_total_ponctuel: summary.totalPonctuel,
    remise_mois_offert: summary.remiseMoisOffert,
    indemnites: summary.indemnites,
    montant_annee_lissee: calculerMontantAnneeLissee(
      summary.abonnements.totalMensuel, config.multiplicateur_annee_lissee,
    ),
    base_loyer: summary.baseLoyer,
    loyer_mensuel: summary.loyer?.loyer_mensuel ?? null,
    loyer_trimestriel: summary.loyer?.loyer_trimestriel ?? null,
    montant_finance: montantFinance,
  };
  const numbers = operandes.map((key) => valeurs[key]);
  if (numbers.some((n) => n == null || !Number.isFinite(n))) {
    return { valeur: null, erreur: 'Un montant de la formule est indisponible pour ce barème.' };
  }
  const terms: number[] = [];
  let term = numbers[0] as number;
  let sign = 1;
  for (let i = 0; i < operateurs.length; i++) {
    const op = operateurs[i];
    const value = numbers[i + 1] as number;
    if (op === '*' || op === '/') {
      if (op === '/' && value === 0) {
        return { valeur: null, erreur: 'Division par zéro dans la formule de marge.' };
      }
      term = op === '*' ? term * value : term / value;
    } else {
      terms.push(sign * term);
      term = value;
      sign = op === '+' ? 1 : -1;
    }
  }
  const result = terms.reduce((sum, n) => sum + n, sign * term);
  if (!Number.isFinite(result)) return { valeur: null, erreur: 'Le résultat de la formule est invalide.' };
  return { valeur: Math.round(result * 100) / 100 || 0, erreur: null };
}

export function synchroniserMargeAuto(
  reponses: SpQuestionReponse[],
  summary: SpCartSummary,
  questionMargeIds: string[] = [],
): SpQuestionReponse[] {
  if (summary.margeErreur) return reponses;
  const valeurs: Record<string, string | undefined> = {
    sp_marge_calculee: String(summary.marge),
    sp_loyer_mensuel_calculee: summary.loyer ? String(summary.loyer.loyer_mensuel) : undefined,
    sp_loyer_trimestriel_calculee: summary.loyer ? String(summary.loyer.loyer_trimestriel) : undefined,
  };
  for (const rep of reponses) {
    if (questionMargeIds.some((id) => rep.question_id === id || rep.question_id.startsWith(`${id}__iter_`))) {
      valeurs[rep.question_id] = String(summary.marge);
    }
  }
  if (Object.entries(valeurs).every(([id, valeur]) =>
    reponses.find((r) => r.question_id === id)?.valeur === valeur)) return reponses;
  return [
    ...reponses.filter((r) => !(r.question_id in valeurs)),
    ...Object.entries(valeurs).filter(([, valeur]) => valeur !== undefined)
      .map(([question_id, valeur]) => ({ question_id, valeur: valeur! })),
  ];
}
