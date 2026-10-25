import type { ExcelConfig, ExcelFieldStyle, ExcelCompositionPartStyle } from '@/types';

/** Keep SP settings when the Excel mapper saves its own configuration. */
export function mergeExcelTemplateConfig(
  existing: Record<string, unknown>,
  mapping: Record<string, unknown>,
): Record<string, unknown> {
  return { ...existing, ...mapping, arrayMappings: mapping.arrayMappings ?? [] };
}

export type ExcelSheetMapping = NonNullable<ExcelConfig['sheetMappings']>[number];
export type ExcelArrayMapping = NonNullable<ExcelConfig['arrayMappings']>[number];
export type ExcelComposedMapping = NonNullable<ExcelConfig['composedMappings']>[number];

export function parseExcelFieldStyles(value: unknown): Record<string, ExcelFieldStyle> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Styles Excel invalides.');
  const styles: Record<string, ExcelFieldStyle> = {};
  for (const [field, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Style Excel invalide : ${field}.`);
    const style = raw as Record<string, unknown>;
    if ((style.horizontal !== undefined && !['left', 'center', 'right'].includes(String(style.horizontal))) ||
        (style.vertical !== undefined && !['top', 'middle', 'bottom'].includes(String(style.vertical))) ||
        (style.bold !== undefined && typeof style.bold !== 'boolean') ||
        (style.fontSize !== undefined && (typeof style.fontSize !== 'number' || !Number.isFinite(style.fontSize) || style.fontSize < 1 || style.fontSize > 409)) ||
        (style.rowHeight !== undefined && (typeof style.rowHeight !== 'number' || !Number.isFinite(style.rowHeight) || style.rowHeight < 1 || style.rowHeight > 409))) {
      throw new Error(`Style Excel invalide : ${field} (taille et hauteur : 1 à 409 points).`);
    }
    styles[field] = style as ExcelFieldStyle;
  }
  return styles;
}

export function parseExcelFieldStyle(value: unknown): ExcelFieldStyle | undefined {
  return parseExcelFieldStyles(value === undefined ? undefined : { composition: value })?.composition;
}

export function parseExcelCompositionPartStyles(value: unknown, template: string): Record<string, ExcelCompositionPartStyle> | undefined {
  const styles = parseExcelFieldStyles(value);
  if (!styles) return undefined;
  const fields = new Set(composedFields(template) ?? []);
  for (const [field, style] of Object.entries(styles)) {
    if (!fields.has(field) || Object.keys(style).some(key => key !== 'bold' && key !== 'fontSize')) {
      throw new Error(`Style de variable composée invalide : ${field}. Seuls le gras et la taille de police sont disponibles.`);
    }
  }
  return styles;
}

export function retainExcelCompositionPartStyles(
  styles: Record<string, ExcelCompositionPartStyle> | undefined,
  template: string,
): Record<string, ExcelCompositionPartStyle> | undefined {
  const fields = composedFields(template);
  if (!styles || !fields) return styles;
  const retained = Object.fromEntries(Object.entries(styles).filter(([field]) => fields.includes(field)));
  return Object.keys(retained).length ? retained : undefined;
}

export function composedFields(template: string): string[] | null {
  const fields: string[] = [];
  const remaining = template.replace(/\{\{([^{}]+)\}\}/g, (_, raw: string) => {
    fields.push(raw.trim());
    return '';
  });
  if (template.length > 2000 || remaining.includes('{{') || remaining.includes('}}') ||
    fields.length < 2 || new Set(fields).size < 2 || fields.some(field => !field || /^[#/^%]/.test(field))) return null;
  return fields;
}

export function buildExcelReplacementConfig(
  existing: Record<string, unknown>,
  sheetMappings: ExcelSheetMapping[],
  arrayMappings: ExcelArrayMapping[],
  keepMappings: boolean,
): Record<string, unknown> {
  const config = mergeExcelTemplateConfig(existing, {
    multiSheet: true,
    sheetMappings: keepMappings ? sheetMappings : [],
    arrayMappings: keepMappings ? arrayMappings : [],
    composedMappings: keepMappings ? existing.composedMappings ?? [] : [],
    sheetCount: keepMappings ? sheetMappings.length : 0,
  });
  if (!keepMappings) {
    delete config.feuilleCiblee;
    delete config.cellMappings;
  }
  return config;
}

export function validateExcelMappings(
  config: Pick<ExcelConfig, 'sheetMappings' | 'arrayMappings' | 'composedMappings'>,
  sheets: { name: string; cells?: Record<string, string> }[],
): string[] {
  const errors: string[] = [];
  const occupied = new Map<string, string>();
  const claim = (sheet: string, ref: string, field: string, unique = false) => {
    const key = `${sheet}!${ref.replace(/\$/g, '').toUpperCase()}`;
    const previous = occupied.get(key);
    if (previous && (unique || previous !== field)) errors.push(`${key} : conflit entre ${previous} et ${field}.`);
    occupied.set(key, field);
  };
  for (const mapping of config.sheetMappings ?? []) {
    try { parseExcelFieldStyles(mapping.fieldStyles); } catch (error) { errors.push((error as Error).message); }
    for (const field of Object.keys(mapping.fieldStyles ?? {})) if (!mapping.mapping[field]) errors.push(`Style Excel sans variable mappée : ${field}.`);
    if (!sheets.some(s => s.name === mapping.sheetName)) errors.push(`Feuille introuvable : ${mapping.sheetName}.`);
    for (const [field, refs] of Object.entries(mapping.mapping)) {
      for (const ref of Array.isArray(refs) ? refs : [refs]) {
        const match = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/i.exec(ref);
        const column = match?.[1].toUpperCase().split('').reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
        if (!match || !column || column > 16384 || +match[2] > 1048576) errors.push(`Cellule Excel invalide : ${ref}.`);
        else claim(mapping.sheetName, ref, field);
      }
    }
  }
  for (const [index, mapping] of (config.composedMappings ?? []).entries()) {
    try { parseExcelFieldStyle(mapping.style); } catch (error) { errors.push((error as Error).message); }
    try { parseExcelCompositionPartStyles(mapping.fieldStyles, mapping.template); } catch (error) { errors.push((error as Error).message); }
    if (!sheets.some(s => s.name === mapping.sheetName)) errors.push(`Feuille introuvable : ${mapping.sheetName}.`);
    const match = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/i.exec(mapping.cellRef);
    const column = match?.[1].toUpperCase().split('').reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
    if (!match || !column || column > 16384 || +match[2] > 1048576) errors.push(`Cellule Excel invalide : ${mapping.cellRef}.`);
    else claim(mapping.sheetName, mapping.cellRef, `composition ${index + 1}`);
    if (!composedFields(mapping.template)) errors.push(`${mapping.sheetName}!${mapping.cellRef} : utilisez au moins deux variables simples distinctes au format {{variable}}.`);
  }
  const arraySheets = new Set<string>();
  for (const mapping of config.arrayMappings ?? []) {
    try { parseExcelFieldStyles(mapping.fieldStyles); } catch (error) { errors.push((error as Error).message); }
    for (const field of Object.keys(mapping.fieldStyles ?? {})) if (!mapping.columnMapping[field]) errors.push(`Style Excel sans champ mappé : ${field}.`);
    if (!sheets.some(s => s.name === mapping.sheetName)) errors.push(`Feuille introuvable : ${mapping.sheetName}.`);
    const arraySheet = JSON.stringify([mapping.arrayId, mapping.sheetName]);
    if (arraySheets.has(arraySheet)) errors.push(`${mapping.arrayId} : déjà configuré sur la feuille ${mapping.sheetName}.`);
    arraySheets.add(arraySheet);
    const validRow = Number.isInteger(mapping.startRow) && mapping.startRow >= 1 && mapping.startRow <= 1048576;
    const validSize = mapping.maxRows === undefined || (Number.isInteger(mapping.maxRows) && mapping.maxRows >= 1 && mapping.maxRows <= 10000);
    if (!validRow) errors.push(`${mapping.arrayId} : ligne de départ invalide.`);
    if (!validSize) errors.push(`${mapping.arrayId} : nombre de lignes invalide (1 à 10000).`);
    const span = mapping.rowSpan ?? 1;
    const lastRow = mapping.startRow + (mapping.maxRows ?? 1) * span;
    if (validRow && validSize && lastRow - 1 > 1048576) errors.push(`${mapping.arrayId} dépasse la limite des lignes Excel.`);
    const columns = new Set<string>();
    if (!Object.keys(mapping.columnMapping).length) errors.push(`${mapping.arrayId} : mappez au moins une colonne.`);
    for (const [field, column] of Object.entries(mapping.columnMapping)) {
      const columnNumber = column.toUpperCase().split('').reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
      if (!/^[A-Z]{1,3}$/i.test(column) || columnNumber > 16384) errors.push(`Colonne invalide : ${column}.`);
      if (columns.has(column.toUpperCase())) errors.push(`${mapping.arrayId} : plusieurs champs utilisent la colonne ${column}.`);
      columns.add(column.toUpperCase());
      for (let row = mapping.startRow; validRow && validSize && row < lastRow; row += span) {
        claim(mapping.sheetName, `${column}${row}`, `${mapping.arrayId}.${field}`, true);
      }
    }
    for (const [index, composition] of (mapping.composedColumns ?? []).entries()) {
      try { parseExcelFieldStyle(composition.style); } catch (error) { errors.push((error as Error).message); }
      try { parseExcelCompositionPartStyles(composition.fieldStyles, composition.template); } catch (error) { errors.push((error as Error).message); }
      const { column, template } = composition;
      const columnNumber = column.toUpperCase().split('').reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
      if (!/^[A-Z]{1,3}$/i.test(column) || columnNumber > 16384) errors.push(`Colonne invalide : ${column}.`);
      if (columns.has(column.toUpperCase())) errors.push(`${mapping.arrayId} : plusieurs champs utilisent la colonne ${column}.`);
      columns.add(column.toUpperCase());
      if (!composedFields(template)) errors.push(`${mapping.arrayId} : la colonne ${column} nécessite au moins deux variables simples distinctes.`);
      for (let row = mapping.startRow; validRow && validSize && row < lastRow; row += span) {
        claim(mapping.sheetName, `${column}${row}`, `${mapping.arrayId}.composition-${index + 1}`, true);
      }
    }
  }
  return Array.from(new Set(errors));
}
