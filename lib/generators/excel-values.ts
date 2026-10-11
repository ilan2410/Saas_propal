import type { ExcelConfig } from '@/types';

export type ExcelFieldType = NonNullable<ExcelConfig['fieldTypes']>[string];
const IDENTIFIER = /(?:numero|numéro|telephone|téléphone|mobile|fixe|siret|siren|postal|iban|reference|référence|code|identifiant|(^|_)id($|_))/i;
const MONEY = /(?:prix|price|montant|amount|total|loyer|economie|économie|remise|cout|coût|frais|taux|quantite|quantité|capital|charges|mensual|abonnements_ht|services_ht|reductions_ht|consommations_ht)/i;

export function uppercaseExcelText(value: string): string {
  return value.split(/([^\s@]+@[^\s@]+\.[^\s@]+)/g)
    .map((part, index) => index % 2 ? part : part.toLocaleUpperCase('fr-FR')).join('');
}

/** Parse the entire amount; never partially parse a phone number or identifier. */
export function parseExcelNumber(value: string): number {
  let text = value.trim().replace(/[\s\u00a0\u202f€$£%]/g, '');
  if (!/^[+-]?\d+(?:[.,]\d+)*$/.test(text)) throw new Error(`Nombre invalide : ${value}`);
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    text = text.replace(decimal === ',' ? /\./g : /,/g, '');
    text = text.replace(decimal, '.');
  } else if (comma >= 0) {
    // French decimal separator; repeated commas are rejected as ambiguous.
    if (text.indexOf(',') !== comma) throw new Error(`Nombre ambigu : ${value}`);
    text = text.replace(',', '.');
  }
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`Nombre invalide : ${value}`);
  return number;
}

export function formatExcelValue(value: unknown, field: string, config: ExcelConfig): string | number | boolean | Date | null {
  if (value === undefined || value === null || value === '') return null;
  const type = config.fieldTypes?.[field];
  if (type === 'text' || (!type && IDENTIFIER.test(field) && !MONEY.test(field))) {
    const text = String(value);
    return config.forcerMajusculesVariables ? uppercaseExcelText(text) : text;
  }
  if (type === 'number') return typeof value === 'number' ? value : parseExcelNumber(String(value));
  if (type === 'date') {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const text = String(value);
    const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    const date = french ? new Date(Date.UTC(+french[3], +french[2] - 1, +french[1])) : new Date(text);
    if (Number.isNaN(date.getTime()) || (french && (date.getUTCDate() !== +french[1] || date.getUTCMonth() !== +french[2] - 1))) throw new Error(`Date invalide : ${text}`);
    return date;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (/^(true|vrai|oui|1)$/i.test(String(value))) return true;
    if (/^(false|faux|non|0)$/i.test(String(value))) return false;
    throw new Error(`Booléen invalide : ${String(value)}`);
  }
  if (value instanceof Date || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  if (!type && MONEY.test(field) && /^[+-]?\d[\d\s\u00a0\u202f€$£%,.]*$/.test(String(value).trim())) return parseExcelNumber(String(value));
  const text = String(value);
  return config.forcerMajusculesVariables ? uppercaseExcelText(text) : text;
}

/** Excel-specific resolver: Word code is deliberately left untouched. */
export function resolveExcelDynamicValue(field: string, createdAt: string | Date): string | undefined {
  const match = /^sp_date_limite_souscription(?:-(\d{1,4}))?$/.exec(field);
  if (!match) return undefined;
  const base = new Date(createdAt);
  if (Number.isNaN(base.getTime())) throw new Error('Date de création de la proposition invalide.');
  const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + +(match[1] ?? 0)));
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}
