import ExcelJS from 'exceljs';
import type { ExcelConfig, ExcelFieldStyle, ExcelCompositionPartStyle } from '@/types';
import { composedFields, parseExcelCompositionPartStyles, parseExcelFieldStyle, parseExcelFieldStyles, validateExcelMappings, type ExcelArrayMapping, type ExcelComposedMapping, type ExcelSheetMapping } from '@/lib/excel/template-config';
import { findValueInData, getNestedValue, isPlainObject, type UnknownRecord } from './data-utils';
import { formatExcelValue, resolveExcelDynamicValue, type ExcelFieldType } from './excel-values';
import { rewriteExcelFormula } from './excel-formulas';
import { addExcelImage, addExcelImageRightCentered, clearExcelCellImages, loadExcelImage } from './excel-images';
import { excelTableRowSpan, inferExcelTableCapacity } from './excel-table-capacity';
import { withTableRowTotal } from './table-row-total';
import { phoneRowsFirst } from './table-phone-order';

const ARRAY_PATHS: Record<string, string> = {
  lignes_fixes: 'lignes.fixes', lignes_mobiles: 'lignes.mobiles', lignes_internet: 'lignes.internet',
  location_materiel: 'location_materiel', forfaits_fixes: 'abonnements.forfaits_fixes',
  forfaits_mobiles: 'abonnements.forfaits_mobiles', services: 'services', equipements: 'equipements',
  reductions: 'reductions', internet: 'abonnements.internet',
};
const FIELD_TYPES = new Set(['text', 'number', 'date', 'boolean', 'image']);
const SA_ARRAYS = new Set(['lignes', 'abonnements', 'sa_lignes_telephoniques', ...Object.keys(ARRAY_PATHS)]);

function excelRowValue(item: UnknownRecord, field: string): unknown {
  const value = findValueInData(item, field);
  if ((field === 'numero' || field === 'numero_ligne') && (value === undefined || value === null || value === '')) {
    return findValueInData(item, field === 'numero' ? 'numero_ligne' : 'numero');
  }
  return value;
}

function renderComposedText(
  template: string,
  renderField: (field: string) => string,
  fieldStyles?: Record<string, ExcelCompositionPartStyle>,
  baseFont?: Partial<ExcelJS.Font>,
): string | ExcelJS.CellRichTextValue {
  const token = /\{\{([^{}]+)\}\}/g;
  const parts: Array<{ text: string; field?: string }> = [];
  let previousEnd = 0;
  let previousValue: string | undefined;
  for (const match of template.matchAll(token)) {
    const between = template.slice(previousEnd, match.index);
    if (previousValue === undefined || previousValue.trim()) parts.push({ text: between });
    const field = match[1].trim();
    const value = renderField(field);
    if (value.trim()) parts.push({ text: value, field });
    previousValue = value;
    previousEnd = match.index + match[0].length;
  }
  parts.push({ text: template.slice(previousEnd) });
  if (!fieldStyles || !Object.keys(fieldStyles).length) return parts.map(part => part.text).join('');
  const nonempty = parts.filter(part => part.text);
  if (!nonempty.length) return '';
  const font = { ...baseFont, bold: baseFont?.bold ?? false };
  return { richText: nonempty.map(part => ({
    text: part.text,
    font: {
      ...font,
      ...(fieldStyles[part.field ?? '']?.bold !== undefined && { bold: fieldStyles[part.field ?? ''].bold }),
      ...(fieldStyles[part.field ?? '']?.fontSize !== undefined && { size: fieldStyles[part.field ?? ''].fontSize }),
    },
  })) };
}

/** Validate stored JSON rather than silently dropping malformed mappings. */
function readConfig(raw: UnknownRecord): ExcelConfig {
  const sheets: ExcelSheetMapping[] = [];
  const arrays: ExcelArrayMapping[] = [];
  if (raw.sheetMappings !== undefined && !Array.isArray(raw.sheetMappings)) throw new Error('Mapping des feuilles Excel invalide.');
  for (const entry of (raw.sheetMappings ?? []) as unknown[]) {
    if (!isPlainObject(entry) || typeof entry.sheetName !== 'string' || !isPlainObject(entry.mapping)) throw new Error('Mapping de feuille Excel invalide.');
    const mapping: ExcelSheetMapping['mapping'] = {};
    for (const [field, refs] of Object.entries(entry.mapping)) {
      if (typeof refs !== 'string' && !(Array.isArray(refs) && refs.every(ref => typeof ref === 'string'))) throw new Error(`Mapping invalide pour ${field}.`);
      mapping[field] = refs as string | string[];
    }
    sheets.push({ sheetName: entry.sheetName, mapping, fieldStyles: parseExcelFieldStyles(entry.fieldStyles) });
  }
  if (!sheets.length && typeof raw.feuilleCiblee === 'string' && isPlainObject(raw.cellMappings)) {
    const mapping: ExcelSheetMapping['mapping'] = {};
    for (const [ref, field] of Object.entries(raw.cellMappings)) {
      if (typeof field !== 'string') throw new Error('Ancien mapping Excel invalide.');
      const previous = mapping[field];
      mapping[field] = previous ? [...(Array.isArray(previous) ? previous : [previous]), ref] : ref;
    }
    sheets.push({ sheetName: raw.feuilleCiblee, mapping });
  }
  const composed: ExcelComposedMapping[] = [];
  if (raw.composedMappings !== undefined && !Array.isArray(raw.composedMappings)) throw new Error('Compositions Excel invalides.');
  for (const entry of (raw.composedMappings ?? []) as unknown[]) {
    if (!isPlainObject(entry) || typeof entry.sheetName !== 'string' || typeof entry.cellRef !== 'string' || typeof entry.template !== 'string') throw new Error('Composition Excel invalide.');
    composed.push({ sheetName: entry.sheetName, cellRef: entry.cellRef, template: entry.template, style: parseExcelFieldStyle(entry.style),
      fieldStyles: parseExcelCompositionPartStyles(entry.fieldStyles, entry.template) });
  }
  if (raw.arrayMappings !== undefined && !Array.isArray(raw.arrayMappings)) throw new Error('Mapping des tableaux Excel invalide.');
  for (const entry of (raw.arrayMappings ?? []) as unknown[]) {
    if (!isPlainObject(entry) || typeof entry.arrayId !== 'string' || typeof entry.sheetName !== 'string' || !isPlainObject(entry.columnMapping)) throw new Error('Mapping de tableau Excel invalide.');
    if (!Object.values(entry.columnMapping).every(column => typeof column === 'string')) throw new Error(`Colonnes invalides : ${entry.arrayId}.`);
    if (entry.composedColumns !== undefined && (!Array.isArray(entry.composedColumns) || !entry.composedColumns.every(column => isPlainObject(column) && typeof column.column === 'string' && typeof column.template === 'string'))) throw new Error(`Colonnes composées invalides : ${entry.arrayId}.`);
    if (entry.stopCondition !== undefined && entry.stopCondition !== 'empty_first_col' && entry.stopCondition !== 'max_rows') throw new Error(`Condition d'arrêt invalide : ${entry.arrayId}.`);
    if (entry.overflowMode !== undefined && entry.overflowMode !== 'error' && entry.overflowMode !== 'insert_rows') throw new Error(`Mode de dépassement invalide : ${entry.arrayId}.`);
    arrays.push({
      arrayId: entry.arrayId, sheetName: entry.sheetName,
      startRow: entry.startRow === undefined ? 2 : entry.startRow as number,
      stopCondition: (entry.stopCondition ?? 'empty_first_col') as ExcelArrayMapping['stopCondition'],
      maxRows: entry.maxRows as number | undefined,
      columnMapping: entry.columnMapping as Record<string, string>,
      fieldStyles: parseExcelFieldStyles(entry.fieldStyles),
      composedColumns: (entry.composedColumns as ExcelArrayMapping['composedColumns'] | undefined)?.map(column => ({
        column: column.column, template: column.template, style: parseExcelFieldStyle(column.style),
        fieldStyles: parseExcelCompositionPartStyles(column.fieldStyles, column.template),
      })),
      overflowMode: entry.overflowMode as ExcelArrayMapping['overflowMode'],
    });
  }
  const fieldTypes: Record<string, ExcelFieldType> = {};
  if (raw.fieldTypes !== undefined && !isPlainObject(raw.fieldTypes)) throw new Error('Types de champs Excel invalides.');
  for (const [field, type] of Object.entries((raw.fieldTypes ?? {}) as UnknownRecord)) {
    if (typeof type !== 'string' || !FIELD_TYPES.has(type)) throw new Error(`Type Excel invalide : ${field}.`);
    fieldTypes[field] = type as ExcelFieldType;
  }
  for (const key of ['imageWidth', 'imageHeight']) {
    if (raw[key] !== undefined && (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]) || raw[key] < 1 || raw[key] > 1000)) throw new Error('Dimensions des images Excel invalides (1 à 1000 pixels).');
  }
  return { ...raw, sheetMappings: sheets, arrayMappings: arrays, composedMappings: composed, fieldTypes } as ExcelConfig;
}

function normalizeRef(ref: string): string {
  const clean = ref.replace(/\$/g, '').toUpperCase();
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(clean);
  const column = match?.[1].split('').reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
  if (!match || !column || column > 16384 || +match[2] > 1048576) throw new Error(`Cellule Excel invalide : ${ref}.`);
  return clean;
}

function moveRef(ref: string, at: number, count: number): string {
  return ref.replace(/(\$?[A-Z]+)(\$?)(\d+)/gi, (_, column, fixed, row) => `${column}${fixed}${+row >= at ? +row + count : row}`);
}

/** Insert a complete styled row block, preserving downstream formulas and mapping coordinates. */
function expandRows(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, templateRow: number, span: number, at: number, count: number, config: ExcelConfig) {
  // ExcelJS cannot safely move table/conditional-format/data-validation metadata.
  const metadata = sheet.model as ExcelJS.WorksheetModel & { tables?: unknown[]; conditionalFormattings?: unknown[]; dataValidations?: UnknownRecord };
  if (metadata.tables?.length || metadata.conditionalFormattings?.length || Object.keys(metadata.dataValidations ?? {}).length) {
    throw new Error(`La feuille ${sheet.name} contient des tableaux structurés, validations ou mises en forme conditionnelles. Réservez davantage de lignes au lieu de les insérer.`);
  }
  if (sheet.rowCount + count > 1048576) throw new Error('Le tableau dépasse la limite des lignes Excel.');
  const formulas: Array<{ sheet: ExcelJS.Worksheet; row: number; col: number; formula: string }> = [];
  workbook.eachSheet(ws => ws.eachRow(row => row.eachCell(cell => {
    if (cell.type === ExcelJS.ValueType.Formula) {
      if ((cell.value as ExcelJS.CellFormulaValue & { shareType?: string }).shareType === 'array') throw new Error('Insertion impossible avec une formule matricielle. Réservez davantage de lignes.');
      formulas.push({ sheet: ws, row: Number(cell.row), col: Number(cell.col), formula: rewriteExcelFormula(cell.formula, ws.name, sheet.name, at, count, false, templateRow) });
    }
  })));
  const names = workbook.definedNames.model.map(name => ({ ...name, ranges: name.ranges.map(range => rewriteExcelFormula(range, '', sheet.name, at, count)) }));
  // A template item may span several rows (vertical merges): copy the whole block.
  const blocks = Array.from({ length: span }, (_, offset) => {
    const source = sheet.getRow(templateRow + offset);
    const values = new Map<number, { value: ExcelJS.CellValue; style: Partial<ExcelJS.Style>; formula?: string }>();
    source.eachCell({ includeEmpty: true }, (cell, col) => {
      values.set(col, { value: structuredClone(cell.value), style: structuredClone(cell.style), formula: cell.type === ExcelJS.ValueType.Formula ? cell.formula : undefined });
    });
    return { values, height: source.height };
  });
  const merges = [...(sheet.model.merges ?? [])];
  const blockMerges = merges.flatMap(merge => {
    const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(merge);
    return match && +match[2] >= templateRow && +match[4] < templateRow + span ? [{ left: match[1], top: +match[2], right: match[3], bottom: +match[4] }] : [];
  });
  for (const merge of merges) sheet.unMergeCells(merge);
  sheet.insertRows(at, Array.from({ length: count }, () => []));
  for (const merge of merges) sheet.mergeCells(moveRef(merge, at, count));
  for (let i = 0; i < count; i++) {
    const row = sheet.getRow(at + i);
    const offset = i % span;
    row.height = blocks[offset].height;
    for (const [col, original] of blocks[offset].values) {
      const cell = row.getCell(col);
      cell.style = structuredClone(original.style);
      cell.value = original.formula
        ? { formula: rewriteExcelFormula(rewriteExcelFormula(original.formula, sheet.name, sheet.name, at, count), sheet.name, sheet.name, 0, row.number - (templateRow + offset), true) }
        : structuredClone(original.value);
    }
  }
  for (let block = 0; block < count / span; block++) {
    const shift = at + block * span - templateRow;
    for (const merge of blockMerges) sheet.mergeCells(`${merge.left}${merge.top + shift}:${merge.right}${merge.bottom + shift}`);
  }
  for (const original of formulas) {
    const row = original.sheet === sheet && original.row >= at ? original.row + count : original.row;
    original.sheet.getCell(row, original.col).value = { formula: original.formula };
  }
  workbook.definedNames.model = names;
  for (const image of sheet.getImages()) {
    const range = image.range;
    if (range.tl.nativeRow >= at - 1) range.tl.nativeRow += count;
    if (range.br && range.br.nativeRow >= at - 1) range.br.nativeRow += count;
  }
  if (sheet.pageSetup.printArea) sheet.pageSetup.printArea = moveRef(sheet.pageSetup.printArea, at, count);
  if (typeof sheet.autoFilter === 'string') sheet.autoFilter = moveRef(sheet.autoFilter, at, count);
  else if (sheet.autoFilter) {
    const filter = sheet.autoFilter;
    sheet.autoFilter = {
      from: typeof filter.from === 'string' ? moveRef(filter.from, at, count) : { ...filter.from, row: filter.from.row >= at ? filter.from.row + count : filter.from.row },
      to: typeof filter.to === 'string' ? moveRef(filter.to, at, count) : { ...filter.to, row: filter.to.row >= at ? filter.to.row + count : filter.to.row },
    };
  }
  for (const mapping of config.sheetMappings ?? []) {
    if (mapping.sheetName !== sheet.name) continue;
    for (const [field, refs] of Object.entries(mapping.mapping)) mapping.mapping[field] = Array.isArray(refs) ? refs.map(ref => moveRef(ref, at, count)) : moveRef(refs, at, count);
  }
  for (const mapping of config.composedMappings ?? []) if (mapping.sheetName === sheet.name) mapping.cellRef = moveRef(mapping.cellRef, at, count);
  for (const mapping of config.arrayMappings ?? []) if (mapping.sheetName === sheet.name && mapping.startRow >= at) mapping.startRow += count;
}

export async function fillExcelWorkbook(
  templateBuffer: ArrayBuffer,
  donnees: UnknownRecord,
  baseData: UnknownRecord,
  rawConfig: UnknownRecord,
  context: { createdAt?: string | Date | null } = {},
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(templateBuffer); }
  catch { throw new Error('Le fichier template Excel est corrompu ou invalide. Utilisez un fichier .xlsx.'); }
  const config = readConfig(rawConfig);
  const errors = validateExcelMappings(config, workbook.worksheets);
  if (errors.length) throw new Error(errors.join('\n'));
  const resolve = (field: string, item?: UnknownRecord): unknown => {
    if (item) {
      const value = excelRowValue(item, field);
      if (value !== undefined && value !== null) return value;
    }
    const sa = findValueInData(donnees, field);
    if (sa !== undefined && sa !== null && sa !== '') return sa;
    const value = baseData[field] ?? findValueInData(baseData, field);
    return (value === undefined || value === null || value === '')
      ? resolveExcelDynamicValue(field, context.createdAt ?? new Date()) ?? value
      : value;
  };
  const claimed = new Map<string, string>();
  const imageCache = new Map<string, ReturnType<typeof loadExcelImage>>();
  const claim = (sheet: ExcelJS.Worksheet, ref: string, owner: string) => {
    const cell = sheet.getCell(normalizeRef(ref));
    // Two references into the same merged cell are also a collision.
    const key = `${sheet.name}!${cell.master.address}`;
    const previous = claimed.get(key);
    if (previous && previous !== owner) throw new Error(`${key} : conflit entre ${previous} et ${owner}.`);
    claimed.set(key, owner);
    if (config.preserverFormules !== false && (cell.master.type === ExcelJS.ValueType.Formula || config.cellulesAvecFormules?.includes(cell.address))) {
      throw new Error(`${key} contient une formule protégée. Choisissez une autre cellule ou désactivez la protection des formules.`);
    }
    return cell.master;
  };
  const write = async (sheet: ExcelJS.Worksheet, cell: ExcelJS.Cell, field: string, value: unknown, forceImage = false) => {
    const type = config.fieldTypes?.[field];
    if (forceImage || type === 'image' || (!type && /image_url$/i.test(field))) {
      clearExcelCellImages(sheet, cell);
      cell.value = null;
      if (value !== undefined && value !== null && value !== '') {
        const url = String(value);
        if (!imageCache.has(url)) imageCache.set(url, loadExcelImage(url));
        addExcelImage(workbook, sheet, cell, await imageCache.get(url)!, config.imageWidth, config.imageHeight);
      }
      return;
    }
    cell.value = formatExcelValue(value, field, config);
    if (typeof cell.value === 'number' && typeof value === 'string' && value.trim().endsWith('%')) {
      cell.value /= 100;
      if (!cell.numFmt || cell.numFmt === 'General') cell.numFmt = '0.00%';
    }
    if (type === 'text' || (typeof cell.value === 'string' && /^0\d+$/.test(cell.value))) cell.numFmt = '@';
    if (type === 'date') cell.numFmt = 'dd/mm/yyyy';
  };

  // An image cannot live inside a text: image variables of a composition are removed from
  // the text and the picture is anchored at the right of the cell, vertically centred.
  const isImageField = (field: string) => {
    const type = config.fieldTypes?.[field];
    return type === 'image' || (!type && /image_url$/i.test(field));
  };
  const compositionImageFields = (template: string) =>
    [...template.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1].trim()).filter(isImageField);
  const withoutImageFields = (template: string) => compositionImageFields(template).length
    ? template.replace(/\{\{([^{}]+)\}\}/g, (token, raw: string) => isImageField(raw.trim()) ? '' : token)
      .replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '').trim()
    : template;
  // Keep the text away from the cell border when the cell also holds a picture.
  // A line break in a composition needs wrapped text, otherwise Excel shows it on one line.
  const wrapCompositionText = (cell: ExcelJS.Cell, template: string) => { if (template.includes('\n')) cell.alignment = { ...cell.alignment, wrapText: true }; };
  const indentCompositionText = (cell: ExcelJS.Cell) => { cell.alignment = { ...cell.alignment, horizontal: 'left', indent: 2 }; };
  const compositionFont = (cell: ExcelJS.Cell, style?: ExcelFieldStyle): Partial<ExcelJS.Font> => ({
    ...cell.font,
    ...(style?.bold !== undefined && { bold: style.bold }),
    ...(style?.fontSize !== undefined && { size: style.fontSize }),
  });
  const placeCompositionImage = async (sheet: ExcelJS.Worksheet, cell: ExcelJS.Cell, urls: unknown[]) => {
    clearExcelCellImages(sheet, cell);
    const url = urls.find(value => value !== undefined && value !== null && value !== '');
    if (!url) return;
    const key = String(url);
    if (!imageCache.has(key)) imageCache.set(key, loadExcelImage(key));
    addExcelImageRightCentered(workbook, sheet, cell, await imageCache.get(key)!, config.imageWidth, config.imageHeight);
  };

  // Plan expansions before claiming/writing cells so all mappings use final coordinates.
  const tables = (config.arrayMappings ?? []).map(mapping => {
    let rows = findValueInData(donnees, mapping.arrayId);
    if (!Array.isArray(rows) && ARRAY_PATHS[mapping.arrayId]) rows = getNestedValue(donnees, ARRAY_PATHS[mapping.arrayId]);
    if (!Array.isArray(rows)) rows = baseData[mapping.arrayId];
    // Prepared SA rows include aliases and numbers linked to their contracts.
    // Raw extracted rows can lack `numero` even when `numero_ligne` is present.
    if (SA_ARRAYS.has(mapping.arrayId) && Array.isArray(baseData[mapping.arrayId])) rows = baseData[mapping.arrayId];
    if (rows !== undefined && rows !== null && !Array.isArray(rows)) throw new Error(`${mapping.arrayId} n'est pas un tableau.`);
    let items = (rows ?? []) as unknown[];
    if (!items.every(isPlainObject)) throw new Error(`${mapping.arrayId} contient une ligne invalide.`);
    items = phoneRowsFirst(items.map(item => withTableRowTotal(item as UnknownRecord)), config.prioriserLignesAvecNumero === true);
    if (mapping.stopCondition === 'empty_first_col') {
      const firstField = Object.keys(mapping.columnMapping)[0];
      const emptyAt = firstField ? items.findIndex(item => {
        const value = excelRowValue(item as UnknownRecord, firstField);
        return value === undefined || value === null || value === '';
      }) : -1;
      if (emptyAt >= 0) items = items.slice(0, emptyAt);
    }
    const sheet = workbook.getWorksheet(mapping.sheetName)!;
    // `capacity` counts items; each item occupies `span` worksheet rows (vertical merges).
    return { mapping, items: items as UnknownRecord[], capacity: mapping.maxRows ?? inferExcelTableCapacity(sheet, mapping, config), span: excelTableRowSpan(sheet, mapping) };
  });
  for (const table of tables.sort((a, b) => a.mapping.startRow - b.mapping.startRow)) {
    const { mapping, items, span } = table;
    if (items.length > table.capacity) {
      if (mapping.overflowMode !== 'insert_rows') throw new Error(`${mapping.arrayId} : ${items.length} lignes pour ${table.capacity} lignes réservées. Augmentez la zone ou activez l'insertion de lignes.`);
      const sheet = workbook.getWorksheet(mapping.sheetName)!;
      const at = mapping.startRow + table.capacity * span;
      const count = (items.length - table.capacity) * span;
      const crossingTables = tables.filter(t => t.mapping.sheetName === mapping.sheetName && t.mapping.startRow < at && t.mapping.startRow + t.capacity * t.span >= at);
      expandRows(workbook, sheet, mapping.startRow, span, at, count, config);
      // Side-by-side tables share inserted worksheet rows; do not insert them twice.
      for (const crossing of crossingTables) crossing.capacity += Math.ceil(count / crossing.span);
    }
  }
  // Validate final ranges as well (including expanded tables).
  const finalConfig = { ...config, arrayMappings: tables.map(t => ({ ...t.mapping, maxRows: t.capacity, rowSpan: t.span })) };
  const finalErrors = validateExcelMappings(finalConfig, workbook.worksheets);
  if (finalErrors.length) throw new Error(finalErrors.join('\n'));
  const writes: Array<{ sheet: ExcelJS.Worksheet; cell: ExcelJS.Cell; field: string; value: unknown; style?: ExcelFieldStyle }> = [];
  for (const mapping of config.sheetMappings ?? []) {
    const sheet = workbook.getWorksheet(mapping.sheetName)!;
    for (const [field, refs] of Object.entries(mapping.mapping)) {
      for (const ref of Array.isArray(refs) ? refs : [refs]) writes.push({ sheet, cell: claim(sheet, ref, field), field, value: resolve(field), style: mapping.fieldStyles?.[field] });
    }
  }
  for (const { mapping, items, capacity, span } of tables) {
    const sheet = workbook.getWorksheet(mapping.sheetName)!;
    for (let index = 0; index < capacity; index++) {
      for (const [field, column] of Object.entries(mapping.columnMapping)) {
        const ref = `${column}${mapping.startRow + index * span}`;
        writes.push({ sheet, cell: claim(sheet, ref, `${mapping.arrayId}.${field}`), field, style: mapping.fieldStyles?.[field],
          value: items[index] ? excelRowValue(items[index], field) : null });
      }
    }
  }
  const uniqueWrites = new Map(writes.map(entry => [`${entry.sheet.name}!${entry.cell.address}`, entry]));
  const rowHeights = new Map<ExcelJS.Row, number>();
  const applyStyle = (sheet: ExcelJS.Worksheet, cell: ExcelJS.Cell, style?: ExcelFieldStyle) => {
    if (!style) return;
    // ExcelJS can share loaded style objects across cells with the same template formatting.
    cell.style = { ...cell.style };
    if (style.horizontal || style.vertical) cell.alignment = {
      ...cell.alignment,
      ...(style.horizontal && { horizontal: style.horizontal }),
      ...(style.vertical && { vertical: style.vertical }),
    };
    if (style.bold !== undefined || style.fontSize !== undefined) cell.font = {
      ...cell.font,
      ...(style.bold !== undefined && { bold: style.bold }),
      ...(style.fontSize !== undefined && { size: style.fontSize }),
    };
    if (style.rowHeight !== undefined) {
      const row = sheet.getRow(Number(cell.row));
      rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, style.rowHeight));
    }
  };
  const applyCompositionStyle = (
    sheet: ExcelJS.Worksheet,
    cell: ExcelJS.Cell,
    style?: ExcelFieldStyle,
    fieldStyles?: Record<string, ExcelCompositionPartStyle>,
  ) => {
    applyStyle(sheet, cell, style);
    // Keep the cell's base font regular so a run explicitly set to "Non" cannot
    // inherit bold from the source template; other runs carry their own font.
    if (Object.values(fieldStyles ?? {}).some(part => part.bold === false)) {
      cell.font = { ...cell.font, bold: false };
    }
  };
  for (const entry of uniqueWrites.values()) {
    await write(entry.sheet, entry.cell, entry.field, entry.value);
    applyStyle(entry.sheet, entry.cell, entry.style);
  }
  for (const { mapping, items, capacity, span } of tables) {
    const sheet = workbook.getWorksheet(mapping.sheetName)!;
    for (let index = 0; index < capacity; index++) {
      for (const [compositionIndex, composition] of (mapping.composedColumns ?? []).entries()) {
        const cell = claim(sheet, `${composition.column}${mapping.startRow + index * span}`, `${mapping.arrayId}.composition-${compositionIndex + 1}`);
        cell.style = { ...cell.style };
        const item = items[index];
        const template = withoutImageFields(composition.template);
        cell.value = item ? renderComposedText(template, (field) => {
          const value = excelRowValue(item, field);
          if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date)) throw new Error(`${mapping.arrayId}.${field} n'est pas un champ simple.`);
          const formatted = formatExcelValue(value, field, config);
          return formatted === null ? '' : formatted instanceof Date ? formatted.toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : String(formatted);
        }, composition.fieldStyles, compositionFont(cell, composition.style)) : null;
        cell.numFmt = '@';
        wrapCompositionText(cell, composition.template);
        if (compositionImageFields(composition.template).length) indentCompositionText(cell);
        await placeCompositionImage(sheet, cell, item ? compositionImageFields(composition.template).map(field => excelRowValue(item, field)) : []);
        applyCompositionStyle(sheet, cell, composition.style, composition.fieldStyles);
      }
    }
  }

  // Replace inline variables in untouched cells; retain surrounding text/rich-text styles.
  const token = /\{\{([^{}]+)\}\}/g;
  const interpolate = (text: string, item?: UnknownRecord) => text.replace(token, (_, raw: string) => {
    const field = raw.trim();
    if (/^[#/^%]/.test(field)) throw new Error(`Balise Excel non prise en charge dans du texte : ${field}. Mappez les tableaux et images sur leurs cellules.`);
    const value = formatExcelValue(resolve(field, item), field, config);
    return value === null ? '' : value instanceof Date ? value.toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : String(value);
  });
  for (const [index, mapping] of (config.composedMappings ?? []).entries()) {
    const sheet = workbook.getWorksheet(mapping.sheetName)!;
    const cell = claim(sheet, mapping.cellRef, `composition ${index + 1}`);
    cell.style = { ...cell.style };
    for (const field of composedFields(mapping.template)!) {
      const value = resolve(field);
      if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date)) throw new Error(`${field} n'est pas un champ simple.`);
    }
    cell.value = renderComposedText(withoutImageFields(mapping.template), (field) => {
      const value = formatExcelValue(resolve(field), field, config);
      return value === null ? '' : value instanceof Date ? value.toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : String(value);
    }, mapping.fieldStyles, compositionFont(cell, mapping.style));
    cell.numFmt = '@';
    wrapCompositionText(cell, mapping.template);
    if (compositionImageFields(mapping.template).length) indentCompositionText(cell);
    await placeCompositionImage(sheet, cell, compositionImageFields(mapping.template).map(field => resolve(field)));
    applyCompositionStyle(sheet, cell, mapping.style, mapping.fieldStyles);
  }
  for (const [row, height] of rowHeights) row.height = height;
  const inlineImages: Array<{ sheet: ExcelJS.Worksheet; cell: ExcelJS.Cell; field: string }> = [];
  workbook.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => {
    if (cell.isMerged && cell.master !== cell) return;
    if (claimed.has(`${sheet.name}!${cell.address}`)) return;
    const table = tables.find(t => t.mapping.sheetName === sheet.name && row.number >= t.mapping.startRow && row.number < t.mapping.startRow + t.capacity * t.span);
    const item = table?.items[Math.floor((row.number - table.mapping.startRow) / table.span)];
    if (typeof cell.value === 'string') {
      const image = /^\s*\{\{%([^{}]+)\}\}\s*$/.exec(cell.value);
      if (image) inlineImages.push({ sheet, cell, field: image[1].trim() });
      else cell.value = table && !item ? cell.value.replace(token, '') : interpolate(cell.value, item);
    } else if (isPlainObject(cell.value) && Array.isArray(cell.value.richText)) {
      // Join runs when a placeholder crosses a style boundary; preserve style for normal runs.
      const runs = cell.value.richText as ExcelJS.RichText[];
      const joined = runs.map(run => run.text).join('');
      const individualCount = runs.reduce((n, run) => n + (run.text.match(token)?.length ?? 0), 0);
      const joinedCount = joined.match(token)?.length ?? 0;
      if (joinedCount > individualCount) cell.value = { richText: [{ ...runs[0], text: table && !item ? joined.replace(token, '') : interpolate(joined, item) }] };
      else cell.value = { richText: runs.map(run => ({ ...run, text: table && !item ? run.text.replace(token, '') : interpolate(run.text, item) })) };
    }
  })));
  for (const { sheet, cell, field } of inlineImages) {
    const table = tables.find(t => t.mapping.sheetName === sheet.name && Number(cell.row) >= t.mapping.startRow && Number(cell.row) < t.mapping.startRow + t.capacity * t.span);
    const item = table?.items[Math.floor((Number(cell.row) - table.mapping.startRow) / table.span)];
    const value = table && !item ? null : resolve(field, item);
    await write(sheet, cell, field, value, true);
  }
  workbook.calcProperties.fullCalcOnLoad = true;
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  if (!bytes.byteLength) throw new Error('Le fichier Excel généré est vide.');
  return bytes;
}
