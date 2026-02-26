import type { TourStepConfig } from './onboarding.types';

export function getCatalogueTourSteps(): TourStepConfig[] {
  return [
    {
      element: '#nav-catalogue',
      title: 'Votre catalogue produits',
      description:
        'Ajoutez ici tous les produits et services que vous proposez. L\'IA s\'en servira pour faire des <strong>recommandations personnalisées</strong> à vos clients.',
      tip: 'Plus votre catalogue est complet et à jour, meilleures seront les suggestions pour vos clients.',
      side: 'right',
      align: 'start',
    },
    {
      element: '#btn-add-product',
      title: 'Ajoutez un produit',
      description:
        'Renseignez le nom, le fournisseur et le prix. Vous pouvez ajouter autant de produits que vous voulez.',
      tip: 'Pensez à inclure les nouvelles offres régulièrement pour que l\'IA ait toujours les meilleurs produits à suggérer.',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '#settings-branding',
      title: 'Logo et couleurs pour vos rapports',
      description:
        'Configurez ici votre logo et vos couleurs. Ils apparaîtront sur les <strong>rapports de suggestions IA</strong> générés pour vos clients.',
      tip: 'Attention : ces paramètres s\'appliquent uniquement aux rapports de comparaison IA, <strong>pas</strong> aux fichiers Word/Excel de proposition.',
      side: 'left',
      align: 'start',
    },
  ];
}
