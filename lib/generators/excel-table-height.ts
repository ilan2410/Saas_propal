import ExcelJS from 'exceljs';

/** Excel does not auto-fit merged cells. Estimate wrapped text and only grow rows. */
export function fitExcelTableText(sheet: ExcelJS.Worksheet, cells: ExcelJS.Cell[]) {
  const merges = (sheet.model.merges ?? []).map(range => {
    const [first, last] = range.split(':').map(ref => sheet.getCell(ref));
    return { first, last };
  });
  for (const cell of new Set(cells.map(cell => cell.master))) {
    const value = cell.value;
    const runs = typeof value === 'string' ? [{ text: value, font: cell.font }]
      : value && typeof value === 'object' && 'richText' in value ? value.richText : [];
    if (!runs.some(run => run.text.trim())) continue;
    const merge = merges.find(range => range.first.address === cell.address);
    const lastCol = Number(merge?.last.col ?? cell.col);
    const lastRow = Number(merge?.last.row ?? cell.row);
    let width = 0;
    for (let col = Number(cell.col); col <= lastCol; col++) {
      width += Math.round((sheet.getColumn(col).width ?? sheet.properties.defaultColWidth ?? 8.43) * 7 + 5);
    }
    const baseSize = cell.font?.size ?? 11;
    width = Math.max(1, width - 12 - (cell.alignment?.indent ?? 0) * baseSize * 2);
    let total = 0;
    let lineWidth = 0;
    let lineHeight = baseSize * 1.3;
    for (const run of runs) {
      const size = run.font?.size ?? baseSize;
      const bold = run.font?.bold ?? cell.font?.bold;
      const glyphWidth = (text: string) => Array.from(text).reduce((sum, char) =>
        sum + size * 4 / 3 * (/[ilI.,'!:;|]/.test(char) ? 0.3 : /[MW@%\u2e80-\uffff]/.test(char) ? 0.95 : 0.56) * (bold ? 1.08 : 1), 0);
      for (const token of run.text.replace(/\r\n?/g, '\n').split(/(\n|[^\S\n]+)/)) {
        if (!token) continue;
        if (token === '\n') {
          total += lineHeight; lineWidth = 0; lineHeight = size * 1.3;
          continue;
        }
        if (lineWidth && lineWidth + glyphWidth(token) > width) {
          total += lineHeight; lineWidth = 0; lineHeight = size * 1.3;
          if (/^\s+$/.test(token)) continue;
        }
        for (const char of token) {
          const advance = glyphWidth(char);
          if (lineWidth && lineWidth + advance > width) {
            total += lineHeight; lineWidth = 0; lineHeight = size * 1.3;
          }
          lineHeight = Math.max(lineHeight, size * 1.3);
          lineWidth += advance;
        }
      }
    }
    const required = total + lineHeight + 6;
    const rows = Array.from({ length: lastRow - Number(cell.row) + 1 }, (_, index) => sheet.getRow(Number(cell.row) + index));
    const height = (row: ExcelJS.Row) => row.height ?? sheet.properties.defaultRowHeight ?? 15;
    let missing = required - rows.reduce((sum, row) => sum + height(row), 0);
    for (const row of rows) {
      if (missing <= 0) break;
      const growth = Math.min(missing, 409 - height(row));
      if (growth > 0) { row.height = height(row) + growth; missing -= growth; }
    }
    cell.alignment = { ...cell.alignment, wrapText: true };
  }
}
