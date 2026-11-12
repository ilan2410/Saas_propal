import PizZip from 'pizzip';
import { posix } from 'node:path';

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DRAWING_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const PREFIX = 'xl/preserved-template/';
const attr = (tag: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];
const relPath = (path: string) => `${posix.dirname(path)}/_rels/${posix.basename(path)}.rels`;
const resolve = (path: string, target: string) => target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(path), target));
const rels = (zip: PizZip, path: string) => [...(zip.file(relPath(path))?.asText() ?? '').matchAll(/<Relationship\b[^>]*\/>/g)].map(match => match[0]);
const emptyRels = () => `<Relationships xmlns="${REL_NS}"></Relationships>`;
const append = (xml: string, content: string) => xml.replace(/<\/[^>]+>\s*$/, match => content + match);

function sheets(zip: PizZip): string[] {
  const relationships = rels(zip, 'xl/workbook.xml');
  return [...zip.file('xl/workbook.xml')!.asText().matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => {
    const relationship = relationships.find(rel => attr(rel, 'Id') === attr(tag, 'r:id'));
    if (!relationship) throw new Error('Relation de feuille Excel introuvable.');
    return resolve('xl/workbook.xml', attr(relationship, 'Target')!);
  });
}

/** Preserve native shapes/groups which ExcelJS cannot read, alongside its generated pictures. */
export function preserveExcelShapes(buffer: ArrayBuffer) {
  const source = new PizZip(buffer);
  const drawings = sheets(source).map(path => {
    const drawingRel = rels(source, path).find(rel => attr(rel, 'Type') === DRAWING_TYPE);
    if (!drawingRel) return undefined;
    const drawingPath = resolve(path, attr(drawingRel, 'Target')!);
    const xml = source.file(drawingPath)!.asText();
    // Some anchors live inside AlternateContent with namespace bindings on ancestors.
    const namespaces = new Map<string, string>();
    for (const [, name, value] of xml.matchAll(/\b(xmlns(?::[\w]+)?)="([^"]*)"/g)) {
      if (!namespaces.has(name)) namespaces.set(name, value);
    }
    const anchors = [...xml.matchAll(/<((?:\w+:)?(?:twoCellAnchor|oneCellAnchor|absoluteAnchor))\b[^>]*>[\s\S]*?<\/\1>/g)]
      .map(match => match[0]).filter(anchor => /<(?:\w+:)?(?:sp|grpSp|cxnSp)\b/.test(anchor));
    return anchors.length ? { drawingPath, namespaces, anchors } : undefined;
  });
  return {
    insertRows(sheetIndex: number, at: number, count: number) {
      const drawing = drawings[sheetIndex];
      if (!drawing) return;
      drawing.anchors = drawing.anchors.map(anchor => anchor.replace(/(<(?:\w+:)?row>)(\d+)(<\/(?:\w+:)?row>)/g,
        (_, start: string, row: string, end: string) => `${start}${+row >= at - 1 ? +row + count : row}${end}`));
    },
    restore(bytes: Uint8Array): Uint8Array {
      if (!drawings.some(Boolean)) return bytes;
      const output = new PizZip(bytes);
      let contentTypes = output.file('[Content_Types].xml')!.asText();
      const sourceTypes = source.file('[Content_Types].xml')!.asText();
      const copied = new Set<string>();
      const copyPart = (path: string): string => {
        const destination = PREFIX + path;
        if (copied.has(path)) return destination;
        copied.add(path);
        const part = source.file(path);
        if (!part) throw new Error(`Ressource de forme Excel introuvable : ${path}`);
        output.file(destination, part.asUint8Array());
        const override = [...sourceTypes.matchAll(/<Override\b[^>]*\/>/g)].map(match => match[0])
          .find(tag => attr(tag, 'PartName') === `/${path}`);
        if (override) contentTypes = append(contentTypes, override.replace(`PartName="/${path}"`, `PartName="/${destination}"`));
        else {
          const extension = posix.extname(path).slice(1);
          const fallback = [...sourceTypes.matchAll(/<Default\b[^>]*\/>/g)].map(match => match[0]).find(tag => attr(tag, 'Extension') === extension);
          if (fallback && ![...contentTypes.matchAll(/<Default\b[^>]*\/>/g)].some(([tag]) => attr(tag, 'Extension') === extension)) contentTypes = append(contentTypes, fallback);
        }
        const relationships = rels(source, path);
        if (relationships.length) output.file(relPath(destination), append(emptyRels(), relationships.map(rel => {
          if (attr(rel, 'TargetMode') === 'External') return rel;
          const target = copyPart(resolve(path, attr(rel, 'Target')!));
          return rel.replace(/\bTarget="[^"]*"/, `Target="/${target}"`);
        }).join('')));
        return destination;
      };
      sheets(output).forEach((sheetPath, index) => {
        const original = drawings[index];
        if (!original) return;
        let sheetXml = output.file(sheetPath)!.asText();
        let sheetRels = output.file(relPath(sheetPath))?.asText() ?? emptyRels();
        const drawingRel = rels(output, sheetPath).find(rel => attr(rel, 'Type') === DRAWING_TYPE);
        let drawingPath: string;
        let drawingXml: string;
        if (drawingRel) {
          drawingPath = resolve(sheetPath, attr(drawingRel, 'Target')!);
          drawingXml = output.file(drawingPath)!.asText();
        } else {
          drawingPath = `xl/drawings/preservedShapes${index + 1}.xml`;
          drawingXml = '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"></xdr:wsDr>';
          let id = 'preservedShapes';
          while (sheetRels.includes(`Id="${id}"`)) id += '_';
          sheetRels = append(sheetRels, `<Relationship Id="${id}" Type="${DRAWING_TYPE}" Target="/${drawingPath}"/>`);
          const drawingTag = `<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${id}"/>`;
          sheetXml = sheetXml.replace(/<(?:legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/worksheet>/, match => drawingTag + match);
          output.file(sheetPath, sheetXml);
          output.file(relPath(sheetPath), sheetRels);
          contentTypes = append(contentTypes, `<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        }
        let drawingRels = output.file(relPath(drawingPath))?.asText() ?? emptyRels();
        const sourceRels = rels(source, original.drawingPath);
        const relationIds = new Map<string, string>();
        const shapeIds = new Map<string, number>();
        let nextId = Math.max(0, ...[...drawingXml.matchAll(/<(?:\w+:)?cNvPr\b[^>]*\bid="(\d+)"/g)].map(match => +match[1])) + 1;
        let anchors = original.anchors.join('');
        for (const [, id] of anchors.matchAll(/<(?:\w+:)?cNvPr\b[^>]*\bid="(\d+)"/g)) shapeIds.set(id, nextId++);
        anchors = anchors.replace(/(<(?:\w+:)?(?:cNvPr|stCxn|endCxn)\b[^>]*\bid=")(\d+)(")/g,
          (match, start: string, id: string, end: string) => shapeIds.has(id) ? `${start}${shapeIds.get(id)}${end}` : match);
        anchors = anchors.replace(/\br:(?:embed|link|id)="([^"]*)"/g, (match, id: string) => {
          if (!relationIds.has(id)) {
            const rel = sourceRels.find(tag => attr(tag, 'Id') === id);
            if (!rel) throw new Error(`Relation de forme Excel introuvable : ${id}`);
            let replacementId = `preserved_${id}`;
            while (drawingRels.includes(`Id="${replacementId}"`)) replacementId += '_';
            let replacement = rel.replace(/\bId="[^"]*"/, `Id="${replacementId}"`);
            if (attr(rel, 'TargetMode') !== 'External') {
              const target = copyPart(resolve(original.drawingPath, attr(rel, 'Target')!));
              replacement = replacement.replace(/\bTarget="[^"]*"/, `Target="/${target}"`);
            }
            drawingRels = append(drawingRels, replacement);
            relationIds.set(id, replacementId);
          }
          return match.replace(`"${id}"`, `"${relationIds.get(id)}"`);
        });
        // Keep namespace bindings scoped to copied anchors to avoid changing generated pictures.
        anchors = anchors.replace(/<((?:\w+:)?(?:twoCellAnchor|oneCellAnchor|absoluteAnchor))\b([^>]*)>/g,
          (_, tag: string, attributes: string) => {
            const missing = [...original.namespaces].filter(([name]) => attr(attributes, name) === undefined)
              .map(([name, value]) => ` ${name}="${value}"`).join('');
            return `<${tag}${attributes}${missing}>`;
          });
        output.file(drawingPath, append(drawingXml, anchors));
        output.file(relPath(drawingPath), drawingRels);
      });
      output.file('[Content_Types].xml', contentTypes);
      return output.generate({ type: 'uint8array', compression: 'DEFLATE' });
    },
  };
}
