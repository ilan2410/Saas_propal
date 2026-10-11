import ExcelJS from 'exceljs';
import type { ExcelConfig } from '@/types';
import type { ExcelArrayMapping } from '@/lib/excel/template-config';

/** Old templates did not record a capacity: detect their existing blank table rows. */
export function inferExcelTableCapacity(sheet: ExcelJS.Worksheet, mapping: ExcelArrayMapping, config: ExcelConfig): number {
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
  const columns = Object.values(mapping.columnMapping);
  const signature = (cell: ExcelJS.Cell) => JSON.stringify({
    // Borders can vary on the first/last row of the same table.
    fill: cell.fill, font: cell.font, numFmt: cell.numFmt, alignment: cell.alignment,
    mergeColumn: cell.master.col,
  });
  const first = columns.map(column => signature(sheet.getCell(`${column}${mapping.startRow}`)));
  let capacity = 1;
  for (let rowNumber = mapping.startRow + 1; rowNumber <= end; rowNumber++) {
    const row = sheet.findRow(rowNumber);
    let hasFixedText = false;
    row?.eachCell(cell => {
      if (cell.isMerged && cell.master !== cell) return;
      const value = cell.value;
      if (value !== null && value !== undefined && value !== '' && cell.type !== ExcelJS.ValueType.Formula && !/^\s*\{\{[^{}]+\}\}\s*$/.test(cell.text)) hasFixedText = true;
    });
    if (hasFixedText) break;
    if (columns.some((column, index) => {
      const cell = sheet.getCell(`${column}${rowNumber}`);
      return cell.type === ExcelJS.ValueType.Formula || Number(cell.master.row) !== rowNumber || signature(cell) !== first[index];
    })) break;
    capacity++;
  }
  return capacity;
}
