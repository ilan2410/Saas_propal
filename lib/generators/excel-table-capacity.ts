import ExcelJS from 'exceljs';
import type { ExcelConfig } from '@/types';
import type { ExcelArrayMapping } from '@/lib/excel/template-config';

const columnNumber = (column: string) => column.toUpperCase().split('').reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);

function parseMerges(sheet: ExcelJS.Worksheet) {
  return (sheet.model.merges ?? []).flatMap(range => {
    const match = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(range);
    return match ? [{ left: columnNumber(match[1]), top: +match[2], right: columnNumber(match[3]), bottom: +match[4] }] : [];
  });
}

/** Worksheet rows used by one item: the tallest vertical merge starting on the first table row. */
export function excelTableRowSpan(sheet: ExcelJS.Worksheet, mapping: ExcelArrayMapping): number {
  const columns = [...Object.values(mapping.columnMapping), ...(mapping.composedColumns ?? []).map(entry => entry.column)].map(columnNumber);
  if (!columns.length) return 1;
  const first = Math.min(...columns);
  const last = Math.max(...columns);
  return parseMerges(sheet)
    .filter(merge => merge.top === mapping.startRow && merge.right >= first && merge.left <= last)
    .reduce((span, merge) => Math.max(span, merge.bottom - merge.top + 1), 1);
}

/** Old templates did not record a capacity: detect their existing blank table items (blocks of `span` rows). */
export function inferExcelTableCapacity(sheet: ExcelJS.Worksheet, mapping: ExcelArrayMapping, config: ExcelConfig): number {
  const span = excelTableRowSpan(sheet, mapping);
  let end = Math.min(sheet.rowCount, mapping.startRow + 9999, 1048576);
  for (const other of config.arrayMappings ?? []) {
    if (other.sheetName === sheet.name && other.startRow > mapping.startRow) end = Math.min(end, other.startRow - 1);
  }
  for (const other of config.sheetMappings ?? []) {
    if (other.sheetName !== sheet.name) continue;
    for (const refs of Object.values(other.mapping)) for (const ref of Array.isArray(refs) ? refs : [refs]) {
      const row = Number(ref.replace(/\$/g, '').match(/\d+$/)?.[0]);
      if (row > mapping.startRow) end = Math.min(end, row - 1);
    }
  }
  const columns = [...Object.values(mapping.columnMapping), ...(mapping.composedColumns ?? []).map(entry => entry.column)];
  const heights = new Map(parseMerges(sheet).map(merge => [`${merge.left}:${merge.top}`, merge.bottom - merge.top + 1]));
  const signature = (cell: ExcelJS.Cell) => JSON.stringify({
    // Borders can vary on the first/last row of the same table.
    fill: cell.fill, font: cell.font, numFmt: cell.numFmt, alignment: cell.alignment,
    mergeColumn: cell.master.col,
    mergeRows: heights.get(`${cell.master.col}:${cell.master.row}`) ?? 1,
  });
  const first = columns.map(column => signature(sheet.getCell(`${column}${mapping.startRow}`)));
  let capacity = 1;
  for (let top = mapping.startRow + span; top + span - 1 <= end; top += span) {
    let hasFixedText = false;
    for (let rowNumber = top; rowNumber < top + span; rowNumber++) {
      sheet.findRow(rowNumber)?.eachCell(cell => {
        if (cell.isMerged && cell.master !== cell) return;
        const value = cell.value;
        if (value !== null && value !== undefined && value !== '' && cell.type !== ExcelJS.ValueType.Formula && !/^\s*\{\{[^{}]+\}\}\s*$/.test(cell.text)) hasFixedText = true;
      });
    }
    if (hasFixedText) break;
    if (columns.some((column, index) => {
      const cell = sheet.getCell(`${column}${top}`);
      return cell.type === ExcelJS.ValueType.Formula || Number(cell.master.row) !== top || signature(cell) !== first[index];
    })) break;
    capacity++;
  }
  return capacity;
}
