import type { ExcelConfig } from '@/types';

/** Keep SP settings when the Excel mapper saves its own configuration. */
export function mergeExcelTemplateConfig(
  existing: Record<string, unknown>,
  mapping: Record<string, unknown>,
): Record<string, unknown> {
  return { ...existing, ...mapping, arrayMappings: mapping.arrayMappings ?? [] };
}

export type ExcelSheetMapping = NonNullable<ExcelConfig['sheetMappings']>[number];
export type ExcelArrayMapping = NonNullable<ExcelConfig['arrayMappings']>[number];

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
    sheetCount: keepMappings ? sheetMappings.length : 0,
  });
  if (!keepMappings) {
    delete config.feuilleCiblee;
    delete config.cellMappings;
  }
  return config;
}

export function validateExcelMappings(
  config: Pick<ExcelConfig, 'sheetMappings' | 'arrayMappings'>,
  sheets: { name: string; cells?: Record<string, string> }[],
): string[] {
  const errors: string[] = [];
  const occupied = new Map<string, string>();
  const claim = (sheet: string, ref: string, field: string) => {
    const key = `${sheet}!${ref.replace(/\$/g, '').toUpperCase()}`;
    const previous = occupied.get(key);
    if (previous && previous !== field) errors.push(`${key} : conflit entre ${previous} et ${field}.`);
    occupied.set(key, field);
  };
  for (const mapping of config.sheetMappings ?? []) {
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
  for (const mapping of config.arrayMappings ?? []) {
    if (!sheets.some(s => s.name === mapping.sheetName)) errors.push(`Feuille introuvable : ${mapping.sheetName}.`);
    const validRow = Number.isInteger(mapping.startRow) && mapping.startRow >= 1 && mapping.startRow <= 1048576;
    const validSize = mapping.maxRows === undefined || (Number.isInteger(mapping.maxRows) && mapping.maxRows >= 1 && mapping.maxRows <= 10000);
    if (!validRow) errors.push(`${mapping.arrayId} : ligne de départ invalide.`);
    if (!validSize) errors.push(`${mapping.arrayId} : nombre de lignes invalide (1 à 10000).`);
    if (validRow && validSize && mapping.startRow + (mapping.maxRows ?? 1) - 1 > 1048576) errors.push(`${mapping.arrayId} dépasse la limite des lignes Excel.`);
    const columns = new Set<string>();
    if (!Object.keys(mapping.columnMapping).length) errors.push(`${mapping.arrayId} : mappez au moins une colonne.`);
    for (const [field, column] of Object.entries(mapping.columnMapping)) {
      const columnNumber = column.toUpperCase().split('').reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
      if (!/^[A-Z]{1,3}$/i.test(column) || columnNumber > 16384) errors.push(`Colonne invalide : ${column}.`);
      if (columns.has(column.toUpperCase())) errors.push(`${mapping.arrayId} : plusieurs champs utilisent la colonne ${column}.`);
      columns.add(column.toUpperCase());
      for (let row = mapping.startRow; validRow && validSize && row < mapping.startRow + (mapping.maxRows ?? 1); row++) {
        claim(mapping.sheetName, `${column}${row}`, `${mapping.arrayId}.${field}`);
      }
    }
  }
  return Array.from(new Set(errors));
}
