import { expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { isolateExcelImageReferences } from './excel-images';

it('preserves repeated logos after pictures with a different media order', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Offre');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  // Distinct media payloads make an incorrect relationship observable after export.
  const pictures = [png, Buffer.concat([png, Buffer.from('logo')])];
  for (const buffer of pictures) workbook.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: 'png' });
  const order = [1, 0, 1, 1];
  order.forEach((id, row) => sheet.addImage(id, { tl: { col: 0, row }, ext: { width: 20, height: 20 } }));
  isolateExcelImageReferences(workbook);
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(await workbook.xlsx.writeBuffer());
  expect(output.worksheets[0].getImages().map(image =>
    Buffer.from(output.getImage(Number(image.imageId)).buffer as unknown as Uint8Array),
  )).toEqual(order.map(id => pictures[id]));
});
