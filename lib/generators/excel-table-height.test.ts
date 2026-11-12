import { expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { fitExcelTableText } from './excel-table-height';

it('grows merged text areas and preserves existing minimum heights', () => {
  const sheet = new ExcelJS.Workbook().addWorksheet('Offre');
  sheet.getColumn('A').width = 12;
  sheet.getColumn('B').width = 12;
  sheet.mergeCells('A1:B2');
  sheet.getRow(1).height = 20;
  sheet.getRow(2).height = 20;
  sheet.getCell('A1').value = 'Une description longue avec plusieurs mots et suffisamment de détails. '.repeat(5);
  fitExcelTableText(sheet, [sheet.getCell('A1')]);
  expect(sheet.getRow(1).height).toBeGreaterThan(20);
  expect(sheet.getCell('A1').alignment.wrapText).toBe(true);
  expect(sheet.getRow(2).height).toBeGreaterThanOrEqual(20);
  const height = sheet.getRow(1).height;
  fitExcelTableText(sheet, [sheet.getCell('A1')]);
  expect(sheet.getRow(1).height).toBe(height);
});

it('accounts for rich text sizes and explicit newlines without shrinking short rows', () => {
  const sheet = new ExcelJS.Workbook().addWorksheet('Offre');
  sheet.getColumn('A').width = 80;
  sheet.getCell('A1').value = { richText: [{ text: 'Titre\n', font: { size: 24, bold: true } }, { text: 'Description\nsuite', font: { size: 12 } }] };
  sheet.getRow(2).height = 100;
  sheet.getCell('A2').value = 'Court';
  fitExcelTableText(sheet, [sheet.getCell('A1'), sheet.getCell('A2')]);
  expect(sheet.getRow(1).height).toBeGreaterThan(60);
  expect(sheet.getRow(2).height).toBe(100);
});

it('uses the full merged width and respects the Excel row-height limit', () => {
  const sheet = new ExcelJS.Workbook().addWorksheet('Offre');
  sheet.getColumn('A').width = 10;
  sheet.getColumn('B').width = 60;
  sheet.mergeCells('A1:B1');
  sheet.getCell('A1').value = 'Description sur une seule ligne.';
  sheet.getCell('A2').value = 'Description sur une seule ligne.';
  sheet.getCell('A3').value = 'Très long '.repeat(2000);
  fitExcelTableText(sheet, [sheet.getCell('A1'), sheet.getCell('A2'), sheet.getCell('A3')]);
  expect(sheet.getRow(1).height).toBeLessThan(sheet.getRow(2).height!);
  expect(sheet.getRow(3).height).toBe(409);
});
