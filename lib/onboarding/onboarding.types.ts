export type TourId =
  | 'welcome'
  | 'template-word'
  | 'template-excel'
  | 'proposition'
  | 'catalogue';

export type Secteur = 'telephonie' | 'bureautique' | 'mixte';

export type PopoverSide = 'top' | 'right' | 'bottom' | 'left';
export type PopoverAlign = 'start' | 'center' | 'end';

export interface TourStepConfig {
  element: string; // CSS selector
  title: string;
  description: string;
  tip?: string;
  side?: PopoverSide;
  align?: PopoverAlign;
}

export interface TourConfig {
  id: TourId;
  title: string;
  steps: TourStepConfig[];
}

export interface OnboardingState {
  toursSeen: TourId[];
  completed: boolean;
  completedAt?: string;
}

export interface SectorExamples {
  nomClient: string;
  offreActuelle: string;
  produit: string;
  fournisseur: string;
}

export const SECTOR_EXAMPLES: Record<Secteur, SectorExamples> = {
  telephonie: {
    nomClient: 'Entreprise Martin',
    offreActuelle: 'forfait mobile 50Go',
    produit: 'SFR Business 100Go',
    fournisseur: 'Orange Pro',
  },
  bureautique: {
    nomClient: 'Cabinet Durand',
    offreActuelle: 'copieur Konica 30ppm',
    produit: 'Ricoh IM C3000',
    fournisseur: 'Canon Solutions',
  },
  mixte: {
    nomClient: 'Société Dupont',
    offreActuelle: 'forfait téléphonie + copieur',
    produit: 'Pack Pro Business',
    fournisseur: 'SFR Business',
  },
};
