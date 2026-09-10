import type { SpSortableTableId, SpTableProductOrders } from '@/types';

export const SP_SORTABLE_TABLE_IDS: SpSortableTableId[] = [
  'sp_situation_proposee_complet',
  'sp_situation_proposee_forfaits',
  'sp_materiel_detail',
  'sp_bdc_operateur_table',
  'sp_bdc_operateur_numeros_table',
  'sp_bdc_internet_table',
  'sp_bdc_materiel_table',
];

export const SP_SORTABLE_TABLE_LABELS: Record<SpSortableTableId, string> = {
  sp_situation_proposee_complet: 'Situation proposée complète',
  sp_situation_proposee_forfaits: 'Situation proposée — forfaits',
  sp_materiel_detail: 'Détail du matériel',
  sp_bdc_operateur_table: 'Bon de commande opérateur',
  sp_bdc_operateur_numeros_table: 'Bon de commande opérateur avec numéros',
  sp_bdc_internet_table: 'Bon de commande Internet',
  sp_bdc_materiel_table: 'Bon de commande matériel',
};

export function orderProductsByPreference<T>(
  items: T[],
  order: string[] | null | undefined,
  getProductId: (item: T) => string | null | undefined,
): T[] {
  if (!Array.isArray(order) || order.length === 0 || items.length < 2) return items;

  const ranks = new Map<string, number>();
  for (const [index, productId] of order.entries()) {
    if (productId && !ranks.has(productId)) ranks.set(productId, index);
  }
  if (ranks.size === 0) return items;

  return items
    .map((item, index) => ({ item, index, rank: ranks.get(getProductId(item) ?? '') }))
    .sort((a, b) => {
      if (a.rank === undefined && b.rank === undefined) return a.index - b.index;
      if (a.rank === undefined) return 1;
      if (b.rank === undefined) return -1;
      return a.rank - b.rank || a.index - b.index;
    })
    .map(({ item }) => item);
}

export function getTableProductOrder(
  orders: SpTableProductOrders | null | undefined,
  tableId: SpSortableTableId,
): string[] | undefined {
  const order = orders?.[tableId];
  return Array.isArray(order) ? order : undefined;
}
