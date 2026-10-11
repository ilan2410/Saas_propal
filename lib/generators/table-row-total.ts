import { parseExcelNumber } from './excel-values';

const PRICE_SUFFIXES = ['prix_unitaire', 'prix_propose', 'prix_mensuel_ht', 'prix_ht', 'tarif', 'tarif_net_mensuel', 'tarif_mensuel', 'prix_mensuel', 'prix', 'valeur_ht', 'loyer_mensuel'];

export function tableTotalSource(fields: string[]): { quantity: string; price: string } | undefined {
  // Prefer the proposed solution when a row also contains SA/comparison aliases.
  const quantities = fields.filter(id => /(^|_)quantite$/.test(id))
    .sort((a, b) => Number(b.startsWith('sp_sp_')) - Number(a.startsWith('sp_sp_')));
  for (const quantity of quantities) {
    const prefix = quantity.slice(0, -'quantite'.length);
    const price = PRICE_SUFFIXES.map(suffix => prefix + suffix).find(id => fields.includes(id));
    if (price) return { quantity, price };
  }
}

/** Only adds prix_total; all existing fields and their values are preserved. */
export function withTableRowTotal(row: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(row, 'prix_total')) return row;
  const source = tableTotalSource(Object.keys(row));
  if (!source) return row;
  const number = (value: unknown) => typeof value === 'number' ? value : parseExcelNumber(String(value));
  try {
    const quantity = number(row[source.quantity]);
    const price = number(row[source.price]);
    if (!Number.isFinite(quantity) || !Number.isFinite(price)) return { ...row, prix_total: '' };
    const total = Math.round((quantity * price + Number.EPSILON) * 100) / 100;
    return { ...row, prix_total: total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' };
  } catch {
    return { ...row, prix_total: '' };
  }
}

export function withTableTotals(data: Record<string, unknown>): Record<string, unknown> {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    Array.isArray(value) ? value.map(row => isRecord(row)
      ? withTableRowTotal(withTableTotals(row)) : row) : isRecord(value) ? withTableTotals(value) : value,
  ]));
}

export function withTableTotalField<T extends { rowFields: { id: string; label: string; type: string }[] }>(definition: T): T {
  if (!tableTotalSource(definition.rowFields.map(field => field.id)) || definition.rowFields.some(field => field.id === 'prix_total')) return definition;
  return { ...definition, rowFields: [...definition.rowFields, { id: 'prix_total', label: 'Prix total HT (quantité × prix unitaire)', type: 'number' }] };
}
