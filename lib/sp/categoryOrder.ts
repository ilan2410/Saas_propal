import { SpCategorie } from '@/types';

export const DEFAULT_SP_CATEGORY_ORDER: SpCategorie[] = ['internet', 'fixe', 'mobile'];

/**
 * Concatène les buckets de lignes produit (internet/fixe/mobile) dans l'ordre
 * de catégories fourni (préférence organisation), avec repli sur l'ordre par
 * défaut si l'ordre fourni est absent ou incomplet.
 */
export function orderProductBuckets<I, F, M>(
  buckets: { internet: I[]; fixe: F[]; mobile: M[] },
  order?: SpCategorie[] | null
): Array<I | F | M> {
  const resolvedOrder = order && order.length > 0 ? order : DEFAULT_SP_CATEGORY_ORDER;

  const seen = new Set<SpCategorie>();
  const result: Array<I | F | M> = [];

  const pushCategorie = (categorie: SpCategorie) => {
    if (seen.has(categorie)) return;
    seen.add(categorie);
    if (categorie === 'internet') result.push(...buckets.internet);
    else if (categorie === 'fixe') result.push(...buckets.fixe);
    else result.push(...buckets.mobile);
  };

  for (const categorie of resolvedOrder) pushCategorie(categorie);
  for (const categorie of DEFAULT_SP_CATEGORY_ORDER) pushCategorie(categorie);

  return result;
}
