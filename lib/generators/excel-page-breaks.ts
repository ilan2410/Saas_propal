import PizZip from 'pizzip';
import { posix } from 'node:path';

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`).exec(tag)?.[1];
}

/** Resolve worksheet parts in workbook order; part numbers need not match sheet IDs. */
function sheetPaths(zip: PizZip): string[] {
  const workbook = zip.file('xl/workbook.xml')!.asText();
  const relationships = zip.file('xl/_rels/workbook.xml.rels')!.asText();
  const targets = new Map([...relationships.matchAll(/<Relationship\b[^>]*>/g)]
    .map(([tag]) => [attribute(tag, 'Id'), attribute(tag, 'Target')]));
  return [...workbook.matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => {
    const target = targets.get(attribute(tag, 'r:id'));
    if (!target) throw new Error('Relation de feuille Excel introuvable.');
    return target.startsWith('/') ? target.slice(1) : posix.normalize(`xl/${target}`);
  });
}

/** ExcelJS drops existing page breaks on load, so preserve their native XML separately. */
export function preserveExcelPageBreaks(source: ArrayBuffer) {
  const zip = new PizZip(source);
  const sheets = sheetPaths(zip).map(path => {
    const xml = zip.file(path)!.asText();
    return {
      rows: xml.match(/<rowBreaks\b[^>]*>[\s\S]*?<\/rowBreaks>/)?.[0],
      columns: xml.match(/<colBreaks\b[^>]*>[\s\S]*?<\/colBreaks>/)?.[0],
    };
  });
  return {
    insertRows(sheetIndex: number, at: number, count: number) {
      const sheet = sheets[sheetIndex];
      // A break is AFTER its row: insertion immediately after it leaves it in place.
      if (sheet.rows) sheet.rows = sheet.rows.replace(/(<brk\b[^>]*\bid=")(\d+)(")/g,
        (_, start: string, id: string, end: string) => `${start}${+id >= at ? +id + count : id}${end}`);
    },
    restore(bytes: Uint8Array): Uint8Array {
      if (!sheets.some(sheet => sheet.rows || sheet.columns)) return bytes;
      const output = new PizZip(bytes);
      sheetPaths(output).forEach((path, index) => {
        const { rows, columns } = sheets[index];
        if (!rows && !columns) return;
        let xml = output.file(path)!.asText();
        xml = xml.replace(/<(rowBreaks|colBreaks)\b[^>]*>[\s\S]*?<\/\1>/g, '');
        // OOXML requires breaks after headerFooter and before drawing/extension elements.
        const boundary = /<(?:customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/worksheet>/;
        xml = xml.replace(boundary, match => `${rows ?? ''}${columns ?? ''}${match}`);
        output.file(path, xml);
      });
      return output.generate({ type: 'uint8array', compression: 'DEFLATE' });
    },
  };
}
