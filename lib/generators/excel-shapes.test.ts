import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { fillExcelWorkbook } from './excel-workbook';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const drawingNs = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const shape = `<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>7</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp><xdr:nvSpPr><xdr:cNvPr id="1" name="En-tête"/></xdr:nvSpPr><xdr:spPr><a:blipFill><a:blip r:embed="rId1"/></a:blipFill><a:effectLst><a:reflection blurRad="6350"/></a:effectLst><a:sp3d z="100"/></xdr:spPr><xdr:txBody><a:p><a:r><a:t>Prix HT mensuel</a:t></a:r></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`;

async function template(picture: boolean) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Offre');
  sheet.getCell('A4').value = 'Produit';
  sheet.getCell('A5').value = 'Total';
  if (picture) sheet.addImage(workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' }), 'C1:D2');
  const zip = new PizZip(await workbook.xlsx.writeBuffer());
  const path = 'xl/drawings/drawing1.xml';
  let xml = zip.file(path)?.asText() ?? `<xdr:wsDr xmlns:xdr="${drawingNs}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>`;
  xml = xml.replace('</xdr:wsDr>', shape.replace('<xdr:twoCellAnchor>', '<xdr:twoCellAnchor xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">') + '</xdr:wsDr>');
  zip.file(path, xml);
  if (!picture) {
    zip.file('xl/worksheets/sheet1.xml', zip.file('xl/worksheets/sheet1.xml')!.asText().replace('</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></worksheet>'));
    zip.file('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
    zip.file('xl/drawings/_rels/drawing1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/shape.png"/></Relationships>');
    zip.file('xl/media/shape.png', png);
  }
  return zip.generate({ type: 'arraybuffer' });
}

describe('native Excel shapes', () => {
  it.each([false, true])('preserves effects, text and related media, existing picture: %s', async picture => {
    const bytes = await fillExcelWorkbook(await template(picture), {}, {}, {});
    const zip = new PizZip(bytes);
    const xml = zip.file(/^xl\/drawings\/[^/]+\.xml$/).map(file => file.asText()).find(text => text.includes('<xdr:sp>'))!;
    expect(xml).toContain('Prix HT mensuel');
    expect(xml).toContain('<a:reflection blurRad="6350"/>');
    expect(xml).toContain('<a:sp3d z="100"/>');
    expect(xml).toContain('r:embed="preserved_rId1"');
    expect(xml).toContain('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"');
    expect(zip.file(/^xl\/preserved-template\/xl\/media\//).some(file => Buffer.from(file.asUint8Array()).equals(png))).toBe(true);
    expect((xml.match(/<xdr:pic>/g) ?? []).length).toBe(picture ? 1 : 0);
    const ids = [...xml.matchAll(/<xdr:cNvPr\b[^>]*id="(\d+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const reload = new ExcelJS.Workbook();
    await reload.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    expect(reload.getWorksheet('Offre')!.getImages()).toHaveLength(picture ? 1 : 0);
  });

  it('moves anchors when table rows are inserted', async () => {
    const bytes = await fillExcelWorkbook(await template(false), {}, { articles: [{ designation: 'A' }, { designation: 'B' }] }, {
      arrayMappings: [{ arrayId: 'articles', sheetName: 'Offre', startRow: 4, maxRows: 1, stopCondition: 'max_rows',
        overflowMode: 'insert_rows', columnMapping: { designation: 'A' } }],
    });
    const xml = new PizZip(bytes).file(/^xl\/drawings\/[^/]+\.xml$/)[0].asText();
    expect(xml).toContain('<xdr:row>6</xdr:row>');
    expect(xml).toContain('<xdr:row>8</xdr:row>');
  });
});
