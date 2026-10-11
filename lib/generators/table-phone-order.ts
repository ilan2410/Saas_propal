const PHONE_FIELD = /(?:^|_)(?:numero(?:_ligne|_telephone|_mobile|_fixe)?|telephone|ligne_mobile|ligne_fixe)$/;

export function hasTablePhoneNumber(row: unknown): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  return Object.entries(row).some(([key, value]) => PHONE_FIELD.test(key)
    && (typeof value === 'string' || typeof value === 'number')
    && String(value).replace(/\D/g, '').length >= 8);
}

/** Stable partition: move complete rows, preserving the order within each group. */
export function phoneRowsFirst<T>(rows: T[], enabled: boolean): T[] {
  if (!enabled) return rows;
  return [...rows.filter(hasTablePhoneNumber), ...rows.filter(row => !hasTablePhoneNumber(row))];
}

export function orderTablePhoneRows(data: Record<string, unknown>, enabled: boolean): Record<string, unknown> {
  if (!enabled) return data;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return phoneRowsFirst(value, true).map(visit);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    }
    return value;
  };
  return visit(data) as Record<string, unknown>;
}
