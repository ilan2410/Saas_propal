import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { fillExcelWorkbook } from './excel-proposition';

describe('fillExcelWorkbook', () => {
  it('préserve le classeur et remplit les cellules SA prioritaires, SP et les tableaux', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Offre');
    sheet.getCell('A1').value = 'Conservé';
    sheet.getCell('B1').value = { formula: '1+1', result: 2 };
    const source = await workbook.xlsx.writeBuffer();
    const bytes = await fillExcelWorkbook(
      source,
      { client: { nom: 'SA' }, lignes: { mobiles: [{ numero: '0612345678' }] } },
      { 'client.nom': 'SP', sp_reference: 'REF-42' },
      {
        sheetMappings: [{ sheetName: 'Offre', mapping: { 'client.nom': 'A2', sp_reference: ['B2', 'C2'] } }],
        arrayMappings: [{ arrayId: 'lignes_mobiles', sheetName: 'Offre', startRow: 4, columnMapping: { numero: 'A' } }],
      },
    );
    const result = new ExcelJS.Workbook();
    await result.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const filled = result.getWorksheet('Offre')!;
    expect(filled.getCell('A1').value).toBe('Conservé');
    expect(filled.getCell('B1').value).toEqual({ formula: '1+1', result: 2 });
    expect(filled.getCell('A2').value).toBe('SA');
    expect(filled.getCell('B2').value).toBe('REF-42');
    expect(filled.getCell('C2').value).toBe('REF-42');
    expect(filled.getCell('A4').value).toBe(612345678);
  });
});
