import { describe, expect, it } from 'vitest';
import type { CatalogueProduit } from '@/types';
import { catalogueForSecteur, defaultSecteur, isAllowedSecteur } from './sectors';

describe('séparation des activités', () => {
  it('conserve la téléphonie lorsque l’organisation devient mixte', () => {
    expect(defaultSecteur('telephonie')).toBe('telephonie');
    expect(defaultSecteur('mixte')).toBe('telephonie');
    expect(isAllowedSecteur('mixte', 'telephonie')).toBe(true);
    expect(isAllowedSecteur('mixte', 'bureautique')).toBe(true);
    expect(isAllowedSecteur('telephonie', 'bureautique')).toBe(false);
    expect(isAllowedSecteur('mixte', 'mixte')).toBe(false);
  });

  it('ne mélange pas des catégories communes aux deux secteurs', () => {
    const products = [
      { id: 'telephone', categorie: 'equipement', secteur_catalogue: 'telephonie' },
      { id: 'copieur', categorie: 'equipement', secteur_catalogue: 'bureautique' },
    ] as CatalogueProduit[];
    expect(catalogueForSecteur(products, 'telephonie').map((product) => product.id)).toEqual(['telephone']);
    expect(catalogueForSecteur(products, 'bureautique').map((product) => product.id)).toEqual(['copieur']);
  });
});
