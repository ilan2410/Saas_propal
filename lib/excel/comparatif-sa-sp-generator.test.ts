import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { ExportSaSpInput } from '@/types';
import { generateComparatifSaSpExcel } from './comparatif-sa-sp-generator';

const input: ExportSaSpInput = {
  dateProposition: '20 octobre 2026',
  companyName: 'Test',
  primaryColor: '#123456',
  saLines: [
    { operateur: 'A', dateFinEngagement: '', quantite: 2, offre: 'Fibre', numero: '', prixHt: 140, indemnites: 50 },
    { operateur: 'B', dateFinEngagement: '', quantite: 1, offre: 'Mobile', numero: '', prixHt: 20, indemnites: 10 },
  ],
  saTotalPrixHt: 160,
  saTotalIndemnites: 60,
  spLines: [
    { operateur: 'A', quantite: 2, offre: 'Fibre', numero: '', prixUnitaire: 30, prixTotal: 60 },
    { operateur: '', quantite: 1, offre: 'Remise', numero: '', prixUnitaire: 0, prixTotal: -5, isRemiseLine: true },
  ],
  spTotalPrix: 55,
  recapLines: [
    { type: 'materiel', libelle: 'Routeur', puht: 100, quantite: 2, ptht: 200 },
    { type: 'fas', libelle: 'FAS', puht: null, quantite: null, ptht: 40 },
    { type: 'marge', libelle: 'Marge', puht: null, quantite: null, ptht: 30 },
  ],
  recapTotal: 270,
  remiseMoisOffert: 25,
  remiseSoldeContrat: 60,
  remiseTotalPonctuel: 270,
  remiseTotal: 355,
};

async function worksheet(data: ExportSaSpInput) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(await generateComparatifSaSpExcel(data)).buffer as ArrayBuffer);
  return workbook.getWorksheet('Récap')!;
}

describe('comparatif SA/SP Excel', () => {
  it('exports editable numeric prices and linked formulas throughout the workbook', async () => {
    const sheet = await worksheet(input);

    expect(sheet.getCell('C10').value).toBe(2);
    expect(sheet.getCell('F10').value).toBe(70);
    expect(sheet.getCell('F10').numFmt).toContain('€');
    expect(sheet.getCell('G10').value).toBe(50);
    expect(sheet.getCell('F12').value).toEqual({ formula: 'SUMPRODUCT(C10:C11,F10:F11)', result: 160 });
    expect(sheet.getCell('G12').value).toEqual({ formula: 'SUM(G10:G11)', result: 60 });

    expect(sheet.getCell('E16').value).toBe(30);
    expect(sheet.getCell('F16').value).toEqual({ formula: 'B16*E16', result: 60 });
    expect(sheet.getCell('F17').value).toBe(-5);
    expect(sheet.getCell('F18').value).toEqual({ formula: 'SUM(F16:F17)', result: 55 });

    expect(sheet.getCell('C22').value).toBe(100);
    expect(sheet.getCell('E22').value).toEqual({ formula: 'C22*D22', result: 200 });
    expect(sheet.getCell('E23').value).toBe(40);
    expect(sheet.getCell('E25').value).toEqual({ formula: 'SUM(E22:E24)', result: 270 });
    expect(sheet.getCell('I21').value).toBe(25);
    expect(sheet.getCell('I22').value).toEqual({ formula: 'G12', result: 60 });
    expect(sheet.getCell('I23').value).toEqual({ formula: 'E25', result: 270 });
    expect(sheet.getCell('I24').value).toEqual({ formula: 'SUM(I21:I23)', result: 355 });
  });

  it('keeps empty sections valid without summing unrelated cells', async () => {
    const sheet = await worksheet({
      ...input,
      saLines: [], saTotalPrixHt: 0, saTotalIndemnites: 0,
      spLines: [], spTotalPrix: 0,
      recapLines: [], recapTotal: 0,
      remiseMoisOffert: 0, remiseSoldeContrat: 0, remiseTotalPonctuel: 0, remiseTotal: 0,
    });
    expect(sheet.getCell('F10').value).toEqual({ formula: '0' });
    expect(sheet.getCell('G10').value).toEqual({ formula: '0' });
    expect(sheet.getCell('F14').value).toEqual({ formula: '0' });
    expect(sheet.getCell('E18').value).toEqual({ formula: '0' });
  });
});
