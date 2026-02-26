import type { TourStepConfig, Secteur, SectorExamples } from './onboarding.types';
import { SECTOR_EXAMPLES } from './onboarding.types';

export function getWordTourSteps(secteur: Secteur = 'telephonie'): TourStepConfig[] {
  const ex: SectorExamples = SECTOR_EXAMPLES[secteur];

  return [
    {
      element: '#upload-zone',
      title: 'Uploadez votre modèle Word',
      description:
        'Glissez votre fichier <strong>.docx</strong> actuel. PropoBoost garde votre mise en page exactement telle quelle — polices, tableaux, couleurs.',
      tip: 'Vous pouvez utiliser n\'importe quel document Word que vous avez déjà.',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '#word-preview-panel',
      title: 'Voici votre document',
      description:
        'PropoBoost a lu votre fichier. Vous voyez ici un aperçu de votre document tel qu\'il sera généré.',
      tip: 'Si l\'aperçu semble bizarre, ne vous inquiétez pas — le vrai document Word n\'est pas modifié.',
      side: 'left',
      align: 'start',
    },
    {
      element: '#variable-list-panel',
      title: "Les 'trous à remplir'",
      description:
        `Ces variables correspondent aux zones qui changent pour chaque client : nom, adresse, offre actuelle… PropoBoost les remplit automatiquement à la génération.`,
      tip: `C'est comme un formulaire papier avec des cases vides. Par exemple : <strong>{{nom_client}}</strong> sera remplacé par "${ex.nomClient}".`,
      side: 'right',
      align: 'start',
    },
    {
      element: '#btn-copy-variable',
      title: 'Copiez et collez dans Word',
      description:
        'Cliquez sur <strong>Copier</strong> à côté d\'une variable, ouvrez votre document Word, cliquez à l\'endroit voulu, puis <strong>Ctrl+V</strong>. Re-uploadez ensuite le fichier modifié.',
      tip: `Par exemple, là où vous mettez habituellement le nom du client, remplacez-le par <strong>{{nom_client}}</strong>.`,
      side: 'bottom',
      align: 'center',
    },
    {
      element: '#btn-validate-template',
      title: 'Validez votre template',
      description:
        'Une fois vos variables placées dans Word et le fichier re-uploadé, cliquez ici pour vérifier que tout est correct.',
      tip: 'PropoBoost vérifie automatiquement que toutes les variables sont bien présentes dans votre document.',
      side: 'top',
      align: 'end',
    },
  ];
}
