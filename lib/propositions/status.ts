// Configuration centralisée des statuts de proposition.
//
// Deux axes indépendants :
//  - statut TECHNIQUE  : chaîne de production, écrit par le wizard / les routes API
//    (draft → processing → extracted / ready → exported / error).
//  - statut COMMERCIAL : défini manuellement par l'utilisateur, pertinent une fois la
//    proposition exportée (en_cours par défaut).

import {
  FileText,
  Clock,
  CheckCircle2,
  FileSearch,
  Zap,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Statut technique                                                    */
/* ------------------------------------------------------------------ */

export type StatutTechnique =
  | 'draft'
  | 'processing'
  | 'extracted'
  | 'ready'
  | 'exported'
  | 'error';

export type StatutTechniqueConfig = {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
  iconClass: string;
};

export const STATUT_TECHNIQUE_CONFIG: Record<StatutTechnique, StatutTechniqueConfig> = {
  draft: {
    label: 'Brouillon',
    icon: FileText,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    iconClass: 'text-slate-500',
  },
  processing: {
    label: 'En cours',
    icon: Clock,
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    iconClass: 'text-amber-500',
  },
  extracted: {
    label: 'Extraite',
    icon: FileSearch,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    iconClass: 'text-blue-500',
  },
  ready: {
    label: 'Prête',
    icon: Zap,
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
    iconClass: 'text-violet-500',
  },
  exported: {
    label: 'Exportée',
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconClass: 'text-emerald-500',
  },
  error: {
    label: 'Erreur',
    icon: AlertTriangle,
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    iconClass: 'text-rose-500',
  },
};

export function getStatutTechnique(statut: string): StatutTechniqueConfig {
  return (
    STATUT_TECHNIQUE_CONFIG[statut as StatutTechnique] ??
    STATUT_TECHNIQUE_CONFIG.processing
  );
}

/** Ordre de tri (colonne « Statut ») : les non-exportées avant les exportées. */
export const STATUT_TECHNIQUE_ORDRE: Record<string, number> = {
  error: 0,
  draft: 1,
  processing: 2,
  extracted: 3,
  ready: 4,
  exported: 5,
};

/* ------------------------------------------------------------------ */
/* Statut commercial                                                   */
/* ------------------------------------------------------------------ */

export type StatutCommercial = 'en_cours' | 'en_attente_client' | 'signee' | 'perdue';

export const STATUTS_COMMERCIAUX: StatutCommercial[] = [
  'en_cours',
  'en_attente_client',
  'signee',
  'perdue',
];

export const STATUT_COMMERCIAL_DEFAUT: StatutCommercial = 'en_cours';

export type StatutCommercialConfig = {
  label: string;
  dotClass: string;
  badgeClass: string;
};

export const STATUT_COMMERCIAL_CONFIG: Record<StatutCommercial, StatutCommercialConfig> = {
  en_cours: {
    label: 'En cours',
    dotClass: 'bg-slate-400',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  en_attente_client: {
    label: 'En attente client',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  signee: {
    label: 'Signée',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  perdue: {
    label: 'Perdue',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

export const STATUT_COMMERCIAL_ORDRE: Record<StatutCommercial, number> = {
  en_cours: 0,
  en_attente_client: 1,
  signee: 2,
  perdue: 3,
};

export function isStatutCommercial(value: unknown): value is StatutCommercial {
  return typeof value === 'string' && (STATUTS_COMMERCIAUX as string[]).includes(value);
}

export function getStatutCommercial(value: string | null | undefined): StatutCommercialConfig {
  return isStatutCommercial(value)
    ? STATUT_COMMERCIAL_CONFIG[value]
    : STATUT_COMMERCIAL_CONFIG[STATUT_COMMERCIAL_DEFAUT];
}
