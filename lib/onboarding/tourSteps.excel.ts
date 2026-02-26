import type { TourStepConfig, Secteur, SectorExamples } from './onboarding.types';
import { SECTOR_EXAMPLES } from './onboarding.types';

export function getExcelTourSteps(secteur: Secteur = 'telephonie'): TourStepConfig[] {
  const ex: SectorExamples = SECTOR_EXAMPLES[secteur];

  return [
    {
      element: '#upload-zone',
      title: 'Uploadez votre fichier Excel',
      description:
        'Glissez votre fichier <strong>.xlsx</strong>. PropoBoost va analyser automatiquement la structure de votre tableau.',
      tip: 'Utilisez le même fichier Excel que vous remplissez manuellement aujourd\'hui.',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '#excel-sheet-selector',
      title: 'Vos feuilles Excel',
      description:
        'PropoBoost a détecté les feuilles de votre fichier. Sélectionnez la <strong>feuille principale</strong> qui contient les données de la proposition.',
      tip: 'Si vous avez plusieurs feuilles, choisissez celle qui contient les données clients et tarifs.',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '#excel-mapping-panel',
      title: 'Associez vos colonnes',
      description:
        `Indiquez à PropoBoost à quoi correspond chaque colonne de votre Excel. Par exemple : <strong>colonne A = ${ex.nomClient}</strong>, colonne B = offre actuelle…`,
      tip: 'Ce mapping est à faire une seule fois. Ensuite, PropoBoost remplira ces colonnes automatiquement pour chaque client.',
      side: 'right',
      align: 'start',
    },
    {
      element: '#btn-save-excel-template',
      title: 'Enregistrez votre template',
      description:
        'Votre configuration est prête ! Cliquez pour sauvegarder. Vous pourrez la réutiliser pour toutes vos futures propositions.',
      tip: 'Vous pouvez créer plusieurs templates (un par type de client, par exemple).',
      side: 'top',
      align: 'end',
    },
  ];
}
