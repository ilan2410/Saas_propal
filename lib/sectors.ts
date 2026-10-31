import type { CatalogueProduit, CatalogueSecteur, Secteur } from '@/types';

export function isCatalogueSecteur(value: unknown): value is CatalogueSecteur {
  return value === 'telephonie' || value === 'bureautique';
}

export function isAllowedSecteur(organizationSecteur: Secteur, secteur: unknown): secteur is CatalogueSecteur {
  return isCatalogueSecteur(secteur) && (organizationSecteur === 'mixte' || organizationSecteur === secteur);
}

export function defaultSecteur(organizationSecteur: Secteur): CatalogueSecteur {
  return organizationSecteur === 'bureautique' ? 'bureautique' : 'telephonie';
}

export function catalogueForSecteur(products: CatalogueProduit[], secteur: CatalogueSecteur): CatalogueProduit[] {
  return products.filter((product) => product.secteur_catalogue === secteur);
}
