import type { TourStepConfig, Secteur, SectorExamples } from './onboarding.types';
import { SECTOR_EXAMPLES } from './onboarding.types';

export function getPropositionTourSteps(secteur: Secteur = 'telephonie'): TourStepConfig[] {
  const ex: SectorExamples = SECTOR_EXAMPLES[secteur];

  return [
    {
      element: '#step1-template-selector',
      title: 'Choisissez votre template',
      description:
        'Sélectionnez le modèle de proposition à utiliser. C\'est le fichier Word ou Excel que vous avez configuré.',
      tip: 'Vous pouvez avoir plusieurs templates pour différents types de propositions.',
      side: 'right',
      align: 'start',
    },
    {
      element: '#step2-upload-docs',
      title: 'Uploadez les documents client',
      description:
        `Glissez la facture, le contrat ou tout document du client. PropoBoost va extraire automatiquement toutes les informations importantes (fournisseur actuel, tarifs, lignes…).`,
      tip: `Plus vous donnez de documents, plus l'extraction sera précise. Facture + contrat = idéal ! Ex : facture ${ex.fournisseur}.`,
      side: 'bottom',
      align: 'start',
    },
    {
      element: '#step3-extracted-data',
      title: 'Vérifiez les données extraites',
      description:
        'PropoBoost a analysé vos documents avec l\'IA. Vérifiez les informations et corrigez si besoin avant de continuer.',
      tip: 'L\'IA est précise mais pas infaillible. Un coup d\'œil rapide suffit !',
      side: 'left',
      align: 'start',
    },
    {
      element: '#step4-ai-suggestions',
      title: 'Les suggestions IA',
      description:
        `PropoBoost compare la situation actuelle du client (${ex.offreActuelle}) avec votre catalogue et suggère les meilleures solutions avec une comparaison de coûts.`,
      tip: `Ces suggestions sont basées sur votre catalogue produits. Plus le catalogue est complet, meilleures sont les recommandations. Ex : ${ex.produit}.`,
      side: 'left',
      align: 'start',
    },
    {
      element: '#btn-generate-proposition',
      title: 'Générez la proposition !',
      description:
        'Tout est prêt. Cliquez pour générer votre proposition complète en quelques secondes.',
      tip: 'Le fichier généré reprend exactement votre template, avec toutes les données remplies automatiquement.',
      side: 'top',
      align: 'center',
    },
  ];
}
