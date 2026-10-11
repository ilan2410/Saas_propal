/** Rewrite A1 references, leaving quoted literals and function names intact. */
export function rewriteExcelFormula(
  formula: string,
  currentSheet: string,
  targetSheet: string,
  row: number,
  count: number,
  copy = false,
  expandFrom?: number,
): string {
  // Structured, external and 3D references need a full Excel formula engine.
  const code = formula.split(/("(?:[^"]|"")*")/g).filter((_, index) => index % 2 === 0).join('');
  if (!copy && /\[|(?:'[^']*:[^']*'|[A-Za-z_][\w.]*:[A-Za-z_][\w.]*)!/.test(code)) {
    throw new Error('Insertion de lignes impossible avec une formule externe, structurée ou 3D. Utilisez une zone réservée plus grande.');
  }
  return formula.split(/("(?:[^"]|"")*")/g).map((part, index) => {
    if (index % 2) return part;
    const cells = part.replace(
      /(?<![\w.])(?:(('[^']*(?:''[^']*)*'|[A-Za-z_][\w.]*)!)?)(\$?[A-Z]{1,3})(\$?)([1-9]\d*)(?::(\$?[A-Z]{1,3})(\$?)([1-9]\d*))?(?![\w.(])/gi,
      (token, prefix: string | undefined, sheet: string | undefined, col: string, absolute: string, rowText: string, endCol: string | undefined, endAbsolute: string | undefined, endRow: string | undefined) => {
        const referencedSheet = sheet ? sheet.replace(/^'|'$/g, '').replace(/''/g, "'") : currentSheet;
        if (!copy && referencedSheet.toLowerCase() !== targetSheet.toLowerCase()) return token;
        const move = (text: string, fixed: string) => {
          const number = +text;
          const next = copy ? (fixed ? number : number + count) : (number >= row ? number + count : number);
          if (next < 1 || next > 1048576) throw new Error('Une formule dépasse les limites des lignes Excel.');
          return `${fixed}${next}`;
        };
        const lastRow = !copy && expandFrom !== undefined && endRow && +rowText >= expandFrom && +rowText < row && +endRow === row - 1
          ? `${endAbsolute ?? ''}${+endRow + count}` : endRow ? move(endRow, endAbsolute ?? '') : '';
        return `${prefix ?? ''}${col}${move(rowText, absolute)}${endCol ? `:${endCol}${lastRow}` : ''}`;
      },
    );
    return cells.replace(/(?<![\w.!])(?:(('[^']*(?:''[^']*)*'|[A-Za-z_][\w.]*)!)?)(\$?)([1-9]\d*):(\$?)([1-9]\d*)(?![\w.])/gi,
      (token, prefix: string | undefined, sheet: string | undefined, firstFixed: string, first: string, lastFixed: string, last: string) => {
        const referencedSheet = sheet ? sheet.replace(/^'|'$/g, '').replace(/''/g, "'") : currentSheet;
        if (!copy && referencedSheet.toLowerCase() !== targetSheet.toLowerCase()) return token;
        const move = (value: string, fixed: string) => copy ? +value + (fixed ? 0 : count) : +value + (+value >= row ? count : 0);
        return `${prefix ?? ''}${firstFixed}${move(first, firstFixed)}:${lastFixed}${move(last, lastFixed)}`;
      });
  }).join('');
}
