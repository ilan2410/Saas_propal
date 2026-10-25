import { afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { fillExcelWorkbook } from './excel-proposition';
import { buildExcelReplacementConfig, mergeExcelTemplateConfig, validateExcelMappings } from '@/lib/excel/template-config';
import { formatExcelValue, parseExcelNumber } from './excel-values';
import { rewriteExcelFormula } from './excel-formulas';
import { applySaEdit, getSaEditableLines } from '@/lib/sp/saCartEdit';
import { buildSaWordData } from './word-data-utils';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function sourceWorkbook(setup: (workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet) => void = () => {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Offre');
  setup(workbook, sheet);
  return workbook.xlsx.writeBuffer();
}

async function loadResult(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return workbook;
}

const tableMapping = {
  arrayId: 'articles', sheetName: 'Offre', startRow: 4, maxRows: 2,
  stopCondition: 'max_rows' as const, columnMapping: { designation: 'A', prix: 'B' },
};

describe('fillExcelWorkbook', () => {
  it('applique les styles par champ Excel sans modifier les autres cellules ni le modèle', async () => {
    const source = await sourceWorkbook((_book, sheet) => {
      sheet.getCell('A4').font = { name: 'Calibri', color: { argb: 'FF123456' }, size: 9 };
      sheet.getCell('B4').font = { bold: true, size: 11 };
      sheet.getCell('A1').alignment = { horizontal: 'right' };
      sheet.getRow(4).height = 15;
    });
    const config = {
      sheetMappings: [{ sheetName: 'Offre', mapping: { client: ['A1', 'A2'] },
        fieldStyles: { client: { horizontal: 'center' as const, vertical: 'middle' as const, fontSize: 14, rowHeight: 24 } } }],
      arrayMappings: [{ ...tableMapping, fieldStyles: {
        designation: { bold: true, fontSize: 16, horizontal: 'center' as const, rowHeight: 35 },
        prix: { bold: false, vertical: 'middle' as const, rowHeight: 28 },
      } }],
    };
    const sheet = (await loadResult(await fillExcelWorkbook(source, { client: 'Alice' },
      { articles: [{ designation: 'Forfait', prix: 12 }, { designation: 'Option', prix: 5 }] }, config))).getWorksheet('Offre')!;
    expect(sheet.getCell('A1').alignment).toMatchObject({ horizontal: 'center', vertical: 'middle' });
    expect(sheet.getRow(1).height).toBe(24);
    expect(sheet.getRow(2).height).toBe(24);
    expect(sheet.getCell('A4').font).toMatchObject({ name: 'Calibri', color: { argb: 'FF123456' }, bold: true, size: 16 });
    expect(sheet.getCell('B4').font.size).toBe(11);
    expect(sheet.getCell('B4').font.bold).not.toBe(true);
    expect(sheet.getRow(4).height).toBe(35);
    expect(sheet.getRow(5).height).toBe(35);
  });

  it('refuse les styles Excel invalides et les champs non mappés', async () => {
    const invalid = { arrayMappings: [{ ...tableMapping, fieldStyles: { designation: { fontSize: 500 } } }] };
    expect(validateExcelMappings(invalid, [{ name: 'Offre' }]).join(' ')).toContain('Style Excel invalide');
    await expect(fillExcelWorkbook(await sourceWorkbook(), {}, {}, invalid)).rejects.toThrow('Style Excel invalide');
    expect(validateExcelMappings({ arrayMappings: [{ ...tableMapping, fieldStyles: { absent: { bold: true } } }] }, [{ name: 'Offre' }]))
      .toContain('Style Excel sans champ mappé : absent.');
  });

  it('applique aussi les styles aux colonnes et cellules composées', async () => {
    const source = await sourceWorkbook((_book, sheet) => {
      sheet.getCell('C4').font = { name: 'Calibri', size: 10 };
      sheet.getCell('D2').font = { name: 'Calibri', size: 10 };
    });
    const result = await loadResult(await fillExcelWorkbook(source, { nom: 'Dupont', prenom: 'Léa' },
      { articles: [{ designation: 'Mobile', numero: '0611' }, { designation: 'Fixe', numero: '0122' }] }, {
        arrayMappings: [{ ...tableMapping, composedColumns: [{ column: 'C', template: '{{designation}}\n{{numero}}',
          style: { bold: true, fontSize: 15, horizontal: 'center', vertical: 'middle', rowHeight: 38 } }] }],
        composedMappings: [{ sheetName: 'Offre', cellRef: 'D2', template: '{{prenom}} {{nom}}',
          style: { bold: true, fontSize: 13, horizontal: 'right', vertical: 'middle', rowHeight: 26 } }],
      }));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('C4').value).toBe('Mobile\n0611');
    expect(sheet.getCell('C4').alignment).toMatchObject({ horizontal: 'center', vertical: 'middle', wrapText: true });
    expect(sheet.getCell('C4').font).toMatchObject({ name: 'Calibri', bold: true, size: 15 });
    expect(sheet.getRow(4).height).toBe(38);
    expect(sheet.getRow(5).height).toBe(38);
    expect(sheet.getCell('D2').value).toBe('Léa Dupont');
    expect(sheet.getCell('D2').alignment).toMatchObject({ horizontal: 'right', vertical: 'middle' });
    expect(sheet.getCell('D2').font).toMatchObject({ name: 'Calibri', bold: true, size: 13 });
    expect(sheet.getRow(2).height).toBe(26);
    expect(validateExcelMappings({ composedMappings: [{ sheetName: 'Offre', cellRef: 'D2', template: '{{prenom}} {{nom}}',
      style: { rowHeight: 500 } }] }, [{ name: 'Offre' }]).join(' ')).toContain('Style Excel invalide');
    expect(validateExcelMappings({ arrayMappings: [{ ...tableMapping, composedColumns: [{ column: 'C', template: '{{designation}} {{numero}}',
      style: { fontSize: 0 } }] }] }, [{ name: 'Offre' }]).join(' ')).toContain('Style Excel invalide');
    await expect(fillExcelWorkbook(source, {}, {}, { composedMappings: [{ sheetName: 'Offre', cellRef: 'D2',
      template: '{{prenom}} {{nom}}', style: { fontSize: 500 } }] })).rejects.toThrow('Style Excel invalide');
  });

  it('met en gras uniquement le nom du produit dans une colonne composée, sans modifier la description', async () => {
    const source = await sourceWorkbook((_workbook, sheet) => {
      sheet.getCell('C4').font = { name: 'Calibri', size: 11, bold: true };
    });
    const config = { arrayMappings: [{
      ...tableMapping, maxRows: 2, columnMapping: { designation: 'A' },
      composedColumns: [{
        column: 'C', template: '{{sp_sp_produit}}\n{{sp_sp_description}}',
        style: { bold: true, fontSize: 12, rowHeight: 38 },
        fieldStyles: { sp_sp_produit: { bold: true, fontSize: 14 }, sp_sp_description: { bold: false, fontSize: 10 } },
      }],
    }] };
    const result = await loadResult(await fillExcelWorkbook(source, {}, {
      articles: [
        { designation: 'Ligne 1', sp_sp_produit: 'Licence Centrex', sp_sp_description: '1 licence = 1 poste' },
        { designation: 'Ligne 2', sp_sp_produit: '', sp_sp_description: 'Description seule' },
      ],
    }, config));
    const sheet = result.getWorksheet('Offre')!;
    const cell = sheet.getCell('C4');
    expect(cell.text).toBe('Licence Centrex\n1 licence = 1 poste');
    expect(cell.font.bold).not.toBe(true);
    const runs = (cell.value as ExcelJS.CellRichTextValue).richText;
    expect(runs.map(run => run.text)).toEqual(['Licence Centrex', '\n', '1 licence = 1 poste']);
    expect(runs[0].font).toMatchObject({ bold: true, size: 14, name: 'Calibri' });
    expect(runs[1].font?.size).toBe(12);
    expect(runs[2].font).toMatchObject({ size: 10, name: 'Calibri' });
    expect(runs[2].font?.bold).not.toBe(true);
    expect(sheet.getCell('C5').text).toBe('Description seule');
    expect((sheet.getCell('C5').value as ExcelJS.CellRichTextValue).richText[0].font).toMatchObject({ size: 10 });
    expect((sheet.getCell('C5').value as ExcelJS.CellRichTextValue).richText[0].font?.bold).not.toBe(true);
    expect(sheet.getRow(4).height).toBe(38);
  });

  it('personnalise aussi les variables d’une cellule composée et refuse les styles obsolètes', async () => {
    const config = { composedMappings: [{
      sheetName: 'Offre', cellRef: 'D2', template: '{{sp_sp_produit}}\n{{sp_sp_description}}',
      fieldStyles: { sp_sp_produit: { bold: true }, sp_sp_description: { bold: false } },
    }] };
    const sheet = (await loadResult(await fillExcelWorkbook(await sourceWorkbook(),
      { sp_sp_produit: 'Centrex', sp_sp_description: 'Description' }, {}, config))).getWorksheet('Offre')!;
    expect(sheet.getCell('D2').text).toBe('Centrex\nDescription');
    const runs = (sheet.getCell('D2').value as ExcelJS.CellRichTextValue).richText;
    expect(runs.map(run => run.text)).toEqual(['Centrex', '\n', 'Description']);
    expect(runs[0].font?.bold).toBe(true);
    expect(runs[2].font?.bold).not.toBe(true);
    const invalid = { composedMappings: [{ ...config.composedMappings[0], fieldStyles: { absent: { bold: true } } }] };
    expect(validateExcelMappings(invalid, [{ name: 'Offre' }]).join(' ')).toContain('Style de variable composée invalide');
    await expect(fillExcelWorkbook(await sourceWorkbook(), {}, {}, invalid)).rejects.toThrow('Style de variable composée invalide');
  });

  it('réutilise un tableau sur deux feuilles sans écraser les autres mappings', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Offre');
    workbook.addWorksheet('Récapitulatif');
    const source = await workbook.xlsx.writeBuffer();
    const second = { ...tableMapping, sheetName: 'Récapitulatif', startRow: 8, columnMapping: { prix: 'D' } };
    const config = {
      arrayMappings: [tableMapping, second],
      sheetMappings: [{ sheetName: 'Récapitulatif', mapping: { client: 'A1' } }],
    };
    expect(validateExcelMappings(config, [{ name: 'Offre' }, { name: 'Récapitulatif' }])).toEqual([]);
    const result = await loadResult(await fillExcelWorkbook(source, { client: 'Alice' },
      { articles: [{ designation: 'Forfait', prix: 12 }, { designation: 'Option', prix: 5 }] }, config));
    expect(result.getWorksheet('Offre')!.getCell('A4').value).toBe('Forfait');
    expect(result.getWorksheet('Offre')!.getCell('B5').value).toBe(5);
    expect(result.getWorksheet('Récapitulatif')!.getCell('D8').value).toBe(12);
    expect(result.getWorksheet('Récapitulatif')!.getCell('D9').value).toBe(5);
    expect(result.getWorksheet('Récapitulatif')!.getCell('A1').value).toBe('Alice');
  });

  it('refuse un deuxième emplacement du même tableau sur la même feuille ou une cellule occupée', () => {
    const sheets = [{ name: 'Offre' }, { name: 'Récapitulatif' }];
    const second = { ...tableMapping, sheetName: 'Récapitulatif', columnMapping: { designation: 'A' } };
    expect(validateExcelMappings({ arrayMappings: [tableMapping, { ...tableMapping, startRow: 10 }] }, sheets))
      .toContain('articles : déjà configuré sur la feuille Offre.');
    expect(validateExcelMappings({ arrayMappings: [tableMapping, second],
      sheetMappings: [{ sheetName: 'Récapitulatif', mapping: { nom: 'A4' } }] }, sheets).join(' '))
      .toContain('Récapitulatif!A4 : conflit');
  });

  it.each(['lignes', 'sp_situation_proposee_complet'])('regroupe les numéros dans %s avec leurs offres et tarifs', async arrayId => {
    const rows = [
      { designation: 'Option', numero: '', tarif: 12 },
      { designation: 'Mobile', numero: '0600225566', tarif: 13.83 },
      { designation: 'Remise', numero: '', tarif: -20 },
      { designation: 'Fixe', numero: '0155662255', tarif: 4.55 },
    ];
    const config = { arrayMappings: [{ arrayId, sheetName: 'Offre', startRow: 4, maxRows: 4,
      stopCondition: 'max_rows', columnMapping: { numero: 'A', designation: 'B', tarif: 'C' } }],
      prioriserLignesAvecNumero: true };
    const bytes = await fillExcelWorkbook(await sourceWorkbook(), { [arrayId]: rows }, { [arrayId]: rows }, config);
    const sheet = (await loadResult(bytes)).getWorksheet('Offre')!;
    expect([4, 5, 6, 7].map(row => sheet.getCell(`B${row}`).value)).toEqual(['Mobile', 'Fixe', 'Option', 'Remise']);
    expect(sheet.getCell('C4').value).toBe(13.83);
    expect(sheet.getCell('C5').value).toBe(4.55);
    expect(sheet.getCell('C7').value).toBe(-20);
    const unsorted = await fillExcelWorkbook(await sourceWorkbook(), { [arrayId]: rows }, { [arrayId]: rows },
      { ...config, prioriserLignesAvecNumero: false });
    expect((await loadResult(unsorted)).getWorksheet('Offre')!.getCell('B4').value).toBe('Option');
  });
  it('écrit quantité × tarif comme nombre Excel en conservant le prix unitaire', async () => {
    const bytes = await fillExcelWorkbook(await sourceWorkbook(),
      { articles: [{ quantite: 3, tarif: '45,90 €' }] }, {}, {
        arrayMappings: [{ arrayId: 'articles', sheetName: 'Offre', startRow: 4, maxRows: 1,
          stopCondition: 'max_rows', columnMapping: { quantite: 'A', tarif: 'B', prix_total: 'C' } }],
        fieldTypes: { tarif: 'number', prix_total: 'number' },
      });
    const result = await loadResult(bytes);
    expect(result.getWorksheet('Offre')!.getCell('B4').value).toBe(45.9);
    expect(result.getWorksheet('Offre')!.getCell('C4').value).toBe(137.7);
  });
  it('remplit les deux alias du numéro ajouté dans le widget SA', async () => {
    const sa = { abonnements: [{ libelle: 'Forfait mobile', tarif_net_mensuel: 45.9, quantite: 1 }] };
    const edited = applySaEdit(sa, {
      kind: 'update', id: getSaEditableLines(sa)[0].id, patch: { numero: '0611223344' },
    });
    const donnees = { situation_actuelle: edited };
    const bytes = await fillExcelWorkbook(await sourceWorkbook(), donnees, buildSaWordData(donnees), {
      arrayMappings: [{ arrayId: 'lignes', sheetName: 'Offre', startRow: 4, maxRows: 5,
        stopCondition: 'max_rows', columnMapping: { numero: 'A', numero_ligne: 'B' } }],
      fieldTypes: { numero: 'text', numero_ligne: 'text' },
    });
    const result = await loadResult(bytes);
    const sheet = result.getWorksheet('Offre')!;
    expect(String(sheet.getCell('A4').value).replace(/\s/g, '')).toBe('0611223344');
    expect(sheet.getCell('B4').value).toBe(sheet.getCell('A4').value);
  });
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
    expect(filled.getCell('A4').value).toBe('0612345678');
  });

  it('conserve les paramètres SP et supprime les mappings de tableaux retirés', () => {
    expect(mergeExcelTemplateConfig({ spVariablesCustom: [{ key: 'sp_test' }], spClausesConditionnelles: [1], arrayMappings: [1], preserverFormules: false }, { sheetMappings: [] }))
      .toEqual({ spVariablesCustom: [{ key: 'sp_test' }], spClausesConditionnelles: [1], arrayMappings: [], preserverFormules: false, sheetMappings: [] });
  });

  it('propose de garder les mappings Excel au remplacement sans perdre les réglages SP', () => {
    const sheetMappings = [{ sheetName: 'Ancienne feuille', mapping: { 'client.nom': 'B2' }, fieldStyles: { 'client.nom': { fontSize: 12 } } }];
    const arrayMappings = [{ ...tableMapping, fieldStyles: { designation: { bold: true, rowHeight: 32 } } }];
    const existing = { spVariablesCustom: [{ key: 'sp_test' }], preserverFormules: true,
      sheetMappings, arrayMappings, composedMappings: [{ sheetName: 'Ancienne feuille', cellRef: 'C2', template: '{{nom}} {{prenom}}' }], multiSheet: true, sheetCount: 1,
      feuilleCiblee: 'Ancienne feuille', cellMappings: { B2: 'client.nom' } };
    const retained = buildExcelReplacementConfig(existing, sheetMappings, arrayMappings, true);
    expect(retained).toMatchObject({ spVariablesCustom: existing.spVariablesCustom, preserverFormules: true,
      sheetMappings, arrayMappings, composedMappings: existing.composedMappings, sheetCount: 1 });
    expect(validateExcelMappings(retained, [{ name: 'Autre feuille' }])).toContain('Feuille introuvable : Ancienne feuille.');
    const cleared = buildExcelReplacementConfig(existing, sheetMappings, arrayMappings, false);
    expect(cleared).toMatchObject({ spVariablesCustom: existing.spVariablesCustom, preserverFormules: true,
      sheetMappings: [], arrayMappings: [], composedMappings: [], sheetCount: 0 });
    expect(cleared).not.toHaveProperty('cellMappings');
    expect(cleared).not.toHaveProperty('feuilleCiblee');
    expect(existing.sheetMappings).toEqual(sheetMappings);
    expect(existing.arrayMappings).toEqual(arrayMappings);
  });

  it('préserve les identifiants et convertit les montants français et internationaux', () => {
    expect(formatExcelValue('00123', 'code_postal', {})).toBe('00123');
    expect(formatExcelValue('01234567890123', 'siret', {})).toBe('01234567890123');
    expect(formatExcelValue('0612345678', 'numero', {})).toBe('0612345678');
    expect(formatExcelValue('12,50 €', 'prix_mensuel_ht', {})).toBe(12.5);
    expect(parseExcelNumber('1 234,50')).toBe(1234.5);
    expect(parseExcelNumber('1.234,50')).toBe(1234.5);
    expect(parseExcelNumber('1,234.50')).toBe(1234.5);
    expect(formatExcelValue('12,50', 'inconnu', {})).toBe('12,50');
    expect(formatExcelValue('12,50', 'inconnu', { fieldTypes: { inconnu: 'number' } })).toBe(12.5);
    expect(formatExcelValue(false, 'actif', {})).toBe(false);
    expect(formatExcelValue('Économies sur 12 mois', 'sp_resume_economies', {})).toBe('Économies sur 12 mois');
    expect(() => parseExcelNumber('12 euros restants')).toThrow();
  });

  it('vide les valeurs absentes et les lignes inutilisées sans toucher le reste du classeur', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      sheet.getCell('A1').value = 'EXEMPLE';
      sheet.getCell('A4').value = 'ancien'; sheet.getCell('B4').value = 1;
      sheet.getCell('A5').value = 'ancien'; sheet.getCell('B5').value = 1;
      sheet.getCell('C5').value = 'Conservé';
      sheet.getCell('A6').value = 'Total';
    });
    const bytes = await fillExcelWorkbook(source, {}, { articles: [{ designation: 'Neuf', prix: '12,50' }] }, {
      sheetMappings: [{ sheetName: 'Offre', mapping: { absent: 'A1' } }], arrayMappings: [tableMapping],
    });
    const result = await loadResult(bytes);
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('A1').value).toBeNull();
    expect(sheet.getCell('A4').value).toBe('Neuf');
    expect(sheet.getCell('B4').value).toBe(12.5);
    expect(sheet.getCell('A5').value).toBeNull(); expect(sheet.getCell('B5').value).toBeNull();
    expect(sheet.getCell('C5').value).toBe('Conservé'); expect(sheet.getCell('A6').value).toBe('Total');
    expect(new PizZip(Buffer.from(bytes)).file('xl/workbook.xml')!.asText()).toContain('fullCalcOnLoad="1"');
  });

  it('refuse les dépassements sans tronquer les données et respecte le premier champ vide', async () => {
    const source = await sourceWorkbook();
    const items = [{ designation: '1', prix: 1 }, { designation: '', prix: 2 }, { designation: '3', prix: 3 }];
    await expect(fillExcelWorkbook(source, {}, { articles: items }, { arrayMappings: [tableMapping] })).rejects.toThrow('3 lignes pour 2');
    const result = await loadResult(await fillExcelWorkbook(source, {}, { articles: items }, {
      arrayMappings: [{ ...tableMapping, stopCondition: 'empty_first_col' }],
    }));
    expect(result.getWorksheet('Offre')!.getCell('A4').value).toBe('1');
    expect(result.getWorksheet('Offre')!.getCell('A5').value).toBeNull();
  });

  it('détecte les 11 lignes réservées d’un ancien template sans maxRows', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      for (let row = 4; row <= 14; row++) {
        sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
        sheet.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
      }
      sheet.getCell('A15').value = 'Total';
      sheet.getCell('B15').value = { formula: 'SUM(B4:B14)', result: 0 };
    });
    const items = Array.from({ length: 11 }, (_, index) => ({ designation: `Ligne ${index + 1}`, prix: index + 1 }));
    const legacy = { ...tableMapping, maxRows: undefined };
    const result = await loadResult(await fillExcelWorkbook(source, {}, { articles: items }, { arrayMappings: [legacy] }));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('A14').value).toBe('Ligne 11');
    expect(sheet.getCell('A15').value).toBe('Total');
    expect(sheet.getCell('B15').formula).toBe('SUM(B4:B14)');
    await expect(fillExcelWorkbook(source, {}, { articles: items }, { arrayMappings: [{ ...legacy, maxRows: 1 }] })).rejects.toThrow('11 lignes pour 1');
  });

  it('arrête la détection automatique avant une autre zone mappée ou un changement de style', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      for (let row = 4; row <= 20; row++) sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
      sheet.getCell('A6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    });
    const items = [{ designation: '1', prix: 1 }, { designation: '2', prix: 2 }, { designation: '3', prix: 3 }];
    await expect(fillExcelWorkbook(source, {}, { articles: items }, {
      arrayMappings: [{ ...tableMapping, maxRows: undefined }],
    })).rejects.toThrow('3 lignes pour 2');
    await expect(fillExcelWorkbook(source, {}, { articles: items }, {
      arrayMappings: [{ ...tableMapping, maxRows: undefined }],
      sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'D5' } }],
    })).rejects.toThrow('3 lignes pour 1');
  });

  it('protège une ligne de total sans libellé pendant la détection automatique', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      sheet.getCell('B6').value = { formula: 'SUM(B4:B5)', result: 0 };
    });
    await expect(fillExcelWorkbook(source, {}, { articles: [{ designation: '1' }, { designation: '2' }, { designation: '3' }] }, {
      preserverFormules: false, arrayMappings: [{ ...tableMapping, maxRows: undefined }],
    })).rejects.toThrow('3 lignes pour 2');
  });

  it('insère des lignes stylées, déplace le pied de tableau et ajuste les formules et mappings', async () => {
    const source = await sourceWorkbook((workbook, sheet) => {
      sheet.getCell('A4').value = 'Modèle';
      sheet.getCell('B4').numFmt = '#,##0.00';
      sheet.getCell('C4').value = { formula: 'B4*2', result: 2 };
      sheet.getCell('C4').font = { bold: true }; sheet.getRow(4).height = 30;
      sheet.mergeCells('D4:E4'); sheet.getCell('D4').value = 'Fusion';
      sheet.getCell('A5').value = 'Total';
      sheet.getCell('B5').value = { formula: 'SUM(B4:B4)', result: 1 };
      sheet.getCell('G6').value = 'Référence';
      workbook.addWorksheet('Résumé').getCell('A1').value = { formula: "'Offre'!B5", result: 1 };
    });
    const result = await loadResult(await fillExcelWorkbook(source, {}, { articles: [{ designation: '1', prix: 1 }, { designation: '2', prix: 2 }, { designation: '3', prix: 3 }], sp_reference: 'REF' }, {
      arrayMappings: [{ ...tableMapping, maxRows: 1, overflowMode: 'insert_rows' }],
      sheetMappings: [{ sheetName: 'Offre', mapping: { sp_reference: 'G6' } }],
    }));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('A7').value).toBe('Total');
    expect(sheet.getCell('B7').formula).toBe('SUM(B4:B6)');
    expect(sheet.getCell('C5').formula).toBe('B5*2'); expect(sheet.getCell('C6').formula).toBe('B6*2');
    expect(sheet.getCell('C6').font.bold).toBe(true); expect(sheet.getCell('B6').numFmt).toBe('#,##0.00');
    expect(sheet.getRow(6).height).toBe(30); expect(sheet.getCell('E6').master.address).toBe('D6');
    expect(sheet.getCell('G8').value).toBe('REF');
    expect(result.getWorksheet('Résumé')!.getCell('A1').formula).toBe("'Offre'!B7");
  });

  describe('lignes fusionnées verticalement', () => {
    const blockTemplate = (reserved: number) => sourceWorkbook((_, sheet) => {
      for (let i = 0; i < reserved; i++) {
        const row = 4 + i * 2;
        sheet.mergeCells(`A${row}:A${row + 1}`); sheet.mergeCells(`B${row}:B${row + 1}`);
        sheet.getCell(`A${row}`).font = { bold: true };
        sheet.getCell(`A${row}`).value = '{{designation}}';
      }
      sheet.getCell(`A${4 + reserved * 2}`).value = 'Total';
    });
    const items = [1, 2, 3].map(n => ({ designation: `Art ${n}`, prix: n }));
    const mapping = { ...tableMapping, overflowMode: 'insert_rows' as const };

    it('écrit un article par bloc de 2 lignes', async () => {
      const result = await loadResult(await fillExcelWorkbook(await blockTemplate(3), {}, { articles: items }, { arrayMappings: [{ ...mapping, maxRows: 3 }] }));
      const sheet = result.getWorksheet('Offre')!;
      expect([4, 6, 8].map(row => sheet.getCell(`A${row}`).value)).toEqual(['Art 1', 'Art 2', 'Art 3']);
      expect([4, 6, 8].map(row => sheet.getCell(`B${row}`).value)).toEqual([1, 2, 3]);
      expect(sheet.getCell('A5').master.address).toBe('A4');
    });

    it('détecte la capacité en blocs sans maxRows', async () => {
      const result = await loadResult(await fillExcelWorkbook(await blockTemplate(3), {}, { articles: items }, { arrayMappings: [{ ...mapping, maxRows: undefined }] }));
      const sheet = result.getWorksheet('Offre')!;
      expect([4, 6, 8].map(row => sheet.getCell(`A${row}`).value)).toEqual(['Art 1', 'Art 2', 'Art 3']);
      expect(sheet.getCell('A10').value).toBe('Total');
    });

    it('duplique les blocs fusionnés quand les lignes sont insérées', async () => {
      const result = await loadResult(await fillExcelWorkbook(await blockTemplate(1), {}, { articles: items }, { arrayMappings: [{ ...mapping, maxRows: 1 }] }));
      const sheet = result.getWorksheet('Offre')!;
      expect([4, 6, 8].map(row => sheet.getCell(`A${row}`).value)).toEqual(['Art 1', 'Art 2', 'Art 3']);
      expect([5, 7, 9].map(row => sheet.getCell(`A${row}`).master.address)).toEqual(['A4', 'A6', 'A8']);
      expect([5, 7, 9].map(row => sheet.getCell(`B${row}`).master.address)).toEqual(['B4', 'B6', 'B8']);
      expect(sheet.getCell('A6').font.bold).toBe(true);
      expect(sheet.getCell('A10').value).toBe('Total');
    });

    it('vide les blocs réservés inutilisés', async () => {
      const result = await loadResult(await fillExcelWorkbook(await blockTemplate(3), {}, { articles: items.slice(0, 1) }, { arrayMappings: [{ ...mapping, maxRows: 3 }] }));
      const sheet = result.getWorksheet('Offre')!;
      expect(sheet.getCell('A4').value).toBe('Art 1');
      expect(sheet.getCell('A6').value ?? '').toBe('');
      expect(sheet.getCell('A8').value ?? '').toBe('');
    });
  });

  it('signale les feuilles, cellules, collisions et formules protégées', async () => {
    const source = await sourceWorkbook((_, sheet) => { sheet.getCell('A1').value = { formula: '1+1', result: 2 }; sheet.mergeCells('B1:C1'); });
    await expect(fillExcelWorkbook(source, {}, {}, { sheetMappings: [{ sheetName: 'Absente', mapping: { nom: 'A1' } }] })).rejects.toThrow('Feuille introuvable');
    await expect(fillExcelWorkbook(source, {}, {}, { sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'XFE1' } }] })).rejects.toThrow('Cellule Excel invalide');
    await expect(fillExcelWorkbook(source, {}, {}, { sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'A1' } }] })).rejects.toThrow('formule protégée');
    await expect(fillExcelWorkbook(source, {}, {}, { sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'B1', ville: 'C1' } }] })).rejects.toThrow('conflit');
    const result = await loadResult(await fillExcelWorkbook(source, { nom: 'Test' }, {}, { preserverFormules: false, sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'A1' } }] }));
    expect(result.getWorksheet('Offre')!.getCell('A1').value).toBe('Test');
    expect(validateExcelMappings({ arrayMappings: [{ ...tableMapping, maxRows: 0 }] }, [{ name: 'Offre' }])).not.toEqual([]);
  });

  it('insère une seule fois les lignes partagées par deux tableaux côte à côte', async () => {
    const source = await sourceWorkbook((_, sheet) => { sheet.getCell('A5').value = 'Pied'; });
    const items = [{ designation: '1', prix: 1 }, { designation: '2', prix: 2 }, { designation: '3', prix: 3 }];
    const result = await loadResult(await fillExcelWorkbook(source, {}, { articles: items, autres: items.slice(0, 2) }, {
      arrayMappings: [
        { ...tableMapping, maxRows: 1, overflowMode: 'insert_rows' },
        { ...tableMapping, arrayId: 'autres', maxRows: 1, overflowMode: 'insert_rows', columnMapping: { designation: 'D', prix: 'E' } },
      ],
    }));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('A7').value).toBe('Pied'); expect(sheet.getCell('A6').value).toBe('3');
    expect(sheet.getCell('D5').value).toBe('2'); expect(sheet.getCell('D6').value).toBeNull();
  });

  it('conserve les pourcentages comme valeurs numériques calculables', async () => {
    const result = await loadResult(await fillExcelWorkbook(await sourceWorkbook(), { taux: '20%' }, {}, {
      sheetMappings: [{ sheetName: 'Offre', mapping: { taux: 'A1' } }],
    }));
    const cell = result.getWorksheet('Offre')!.getCell('A1');
    expect(cell.value).toBe(0.2); expect(cell.numFmt).toBe('0.00%');
  });

  it('refuse une insertion risquée dans une feuille avec validation de données', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      sheet.getCell('A4').dataValidation = { type: 'list', allowBlank: true, formulae: ['"A,B"'] };
    });
    await expect(fillExcelWorkbook(source, {}, { articles: [{ designation: '1' }, { designation: '2' }] }, {
      arrayMappings: [{ ...tableMapping, maxRows: 1, overflowMode: 'insert_rows' }],
    })).rejects.toThrow('Réservez davantage de lignes');
  });

  it('remplit les phrases, dates dynamiques et textes riches en conservant les emails', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      sheet.getCell('A1').value = 'Client : {{nom}}, email : {{email}}';
      sheet.getCell('A2').value = 'Valable jusqu’au {{sp_date_limite_souscription-15}}';
      sheet.getCell('A3').value = { richText: [{ text: 'Bonjour ', font: { bold: true } }, { text: '{{nom}}', font: { italic: true } }] };
      sheet.getCell('A4').value = { richText: [{ text: '{{no' }, { text: 'm}}' }] };
      sheet.getCell('A5').value = '{{sp_clause_geste}}';
    });
    const result = await loadResult(await fillExcelWorkbook(source, { nom: 'sarl test', email: 'Test@example.com' }, { sp_clause_geste: 'Offert' }, {
      forcerMajusculesVariables: true, fieldTypes: { 'sp_date_limite_souscription-30': 'date' },
      sheetMappings: [{ sheetName: 'Offre', mapping: { 'sp_date_limite_souscription-30': 'B1', entreprise_siret: 'B2' } }],
    }, { createdAt: '2026-09-20T10:00:00Z' }));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('A1').value).toBe('Client : SARL TEST, email : Test@example.com');
    expect(sheet.getCell('A2').value).toBe('Valable jusqu’au 05/10/2026');
    expect(sheet.getCell('A3').value).toEqual({ richText: [{ text: 'Bonjour ', font: { bold: true } }, { text: 'SARL TEST', font: { italic: true } }] });
    expect(sheet.getCell('A4').text).toBe('SARL TEST'); expect(sheet.getCell('A5').value).toBe('OFFERT');
    expect(sheet.getCell('B1').value).toEqual(new Date('2026-10-20T00:00:00Z'));
    expect(sheet.getCell('B1').numFmt).toBe('dd/mm/yyyy');
  });

  it('compose plusieurs champs simples dans une cellule et conserve les autres mappings', async () => {
    const source = await sourceWorkbook();
    const result = await loadResult(await fillExcelWorkbook(source, { prenom: 'Alice', nom: 'Martin' }, {}, {
      sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'B2' } }],
      composedMappings: [{ sheetName: 'Offre', cellRef: 'A1', template: '{{prenom}} {{nom}}' }],
    }));
    expect(result.getWorksheet('Offre')!.getCell('A1').value).toBe('Alice Martin');
    expect(result.getWorksheet('Offre')!.getCell('B2').value).toBe('Martin');
  });

  it('refuse les collisions et les expressions non composées', async () => {
    const source = await sourceWorkbook();
    const composedMappings = [{ sheetName: 'Offre', cellRef: 'A1', template: '{{prenom}} {{nom}}' }];
    await expect(fillExcelWorkbook(source, {}, {}, {
      sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'A1' } }], composedMappings,
    })).rejects.toThrow('conflit');
    expect(validateExcelMappings({ composedMappings: [{ ...composedMappings[0], template: '{{prenom}}' }] }, [{ name: 'Offre' }])).not.toEqual([]);
    expect(validateExcelMappings({ composedMappings: [{ ...composedMappings[0], template: '{{#lignes}} {{nom}}' }] }, [{ name: 'Offre' }])).not.toEqual([]);
    await expect(fillExcelWorkbook(source, { prenom: ['Alice'], nom: 'Martin' }, {}, { composedMappings })).rejects.toThrow('champ simple');
  });

  it('déplace les cellules composées après insertion de lignes', async () => {
    const result = await loadResult(await fillExcelWorkbook(await sourceWorkbook(), {}, {
      articles: [{ designation: 'A' }, { designation: 'B' }], prenom: 'Alice', nom: 'Martin',
    }, {
      arrayMappings: [{ ...tableMapping, maxRows: 1, overflowMode: 'insert_rows', columnMapping: { designation: 'A' } }],
      composedMappings: [{ sheetName: 'Offre', cellRef: 'C6', template: '{{prenom}} {{nom}}' }],
    }));
    expect(result.getWorksheet('Offre')!.getCell('C7').value).toBe('Alice Martin');
  });

  it('supprime le séparateur après un premier champ vide dans les cellules composées', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      sheet.getCell('D1').value = '{{type}} - {{designation}}';
    });
    const composedMappings = [{ sheetName: 'Offre', cellRef: 'A1', template: '{{type}} - {{designation}}' }];
    const sheet = (await loadResult(await fillExcelWorkbook(source,
      { type: '', designation: 'Abonnement SDA' },
      { designation: 'Abonnement SDA' },
      { composedMappings }))).getWorksheet('Offre')!;
    expect(sheet.getCell('A1').value).toBe('Abonnement SDA');
    expect(sheet.getCell('D1').value).toBe(' - Abonnement SDA'); // Texte libre inchangé.

    const filled = (await loadResult(await fillExcelWorkbook(await sourceWorkbook(),
      { type: 'Mobile', designation: 'Forfait Pro' }, {}, { composedMappings }))).getWorksheet('Offre')!;
    expect(filled.getCell('A1').value).toBe('Mobile - Forfait Pro');

    const missingSecond = (await loadResult(await fillExcelWorkbook(await sourceWorkbook(),
      { type: 'Fixe' }, {}, { composedMappings }))).getWorksheet('Offre')!;
    expect(missingSecond.getCell('A1').value).toBe('Fixe - ');

    const threeFields = (await loadResult(await fillExcelWorkbook(await sourceWorkbook(),
      { type: ' ', designation: 'Abonnement SDA', site: 'Paris' }, {}, {
        composedMappings: [{ sheetName: 'Offre', cellRef: 'A1', template: '{{type}} - {{designation}} / {{site}}' }],
      }))).getWorksheet('Offre')!;
    expect(threeFields.getCell('A1').value).toBe('Abonnement SDA / Paris');
  });

  it('supprime le séparateur par ligne dans les colonnes composées sans toucher les autres colonnes', async () => {
    const rows = [
      { type: 'Mobile', designation: 'Forfait Pro' },
      { type: '', designation: 'Abonnement SDA' },
      { designation: 'Acces fibre' },
      { type: 'Fixe', designation: 'Ligne fixe' },
    ];
    const sheet = (await loadResult(await fillExcelWorkbook(await sourceWorkbook(), {}, { articles: rows }, {
      arrayMappings: [{
        ...tableMapping, maxRows: 4, columnMapping: { designation: 'A' },
        composedColumns: [{ column: 'C', template: '{{type}} - {{designation}}' }],
      }],
    }))).getWorksheet('Offre')!;
    expect([4, 5, 6, 7].map(row => sheet.getCell(`C${row}`).value)).toEqual([
      'Mobile - Forfait Pro', 'Abonnement SDA', 'Acces fibre', 'Fixe - Ligne fixe',
    ]);
    expect([4, 5, 6, 7].map(row => sheet.getCell(`A${row}`).value))
      .toEqual(rows.map(row => row.designation));
  });

  it('protège les formules et les cellules fusionnées lors des compositions', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      sheet.getCell('A1').value = { formula: '1+1', result: 2 };
      sheet.mergeCells('B1:C1');
    });
    await expect(fillExcelWorkbook(source, {}, {}, {
      composedMappings: [{ sheetName: 'Offre', cellRef: 'A1', template: '{{nom}} {{prenom}}' }],
    })).rejects.toThrow('formule protégée');
    await expect(fillExcelWorkbook(source, {}, {}, {
      sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'B1' } }],
      composedMappings: [{ sheetName: 'Offre', cellRef: 'C1', template: '{{nom}} {{prenom}}' }],
    })).rejects.toThrow('conflit');
  });

  it('compose chaque ligne du bon tableau même avec deux tableaux côte à côte', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      sheet.getCell('C4').value = 'Ancien texte';
      sheet.getCell('C5').value = 'Ancien texte';
    });
    const result = await loadResult(await fillExcelWorkbook(source, {}, {
      articles: [{ designation: 'Mobile', numero: '0612345678' }, { designation: 'Option' }],
      autres: [{ designation: 'Internet', numero: '0123456789' }, { designation: 'Fixe', numero: '0987654321' }],
      numero: 'NE DOIT PAS ETRE UTILISE',
    }, {
      arrayMappings: [
        { ...tableMapping, maxRows: 3, columnMapping: { designation: 'A' }, composedColumns: [{ column: 'C', template: '{{designation}} — {{numero}}' }] },
        { ...tableMapping, arrayId: 'autres', maxRows: 3, columnMapping: { designation: 'E' }, composedColumns: [{ column: 'G', template: '{{designation}} / {{numero}}' }] },
      ],
    }));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('C4').value).toBe('Mobile — 0612345678');
    expect(sheet.getCell('C5').value).toBe('Option — ');
    expect(sheet.getCell('C6').value).toBeNull();
    expect(sheet.getCell('G4').value).toBe('Internet / 0123456789');
    expect(sheet.getCell('G5').value).toBe('Fixe / 0987654321');
    expect(sheet.getCell('G6').value).toBeNull();
  });

  it('détecte les lignes réservées des colonnes composées sans maxRows', async () => {
    const source = await sourceWorkbook((_, sheet) => {
      sheet.getCell('A4').value = 'Modèle';
      sheet.getCell('C4').numFmt = '@';
      sheet.getCell('C5').numFmt = '@';
      sheet.getCell('A6').value = 'Total';
    });
    const result = await loadResult(await fillExcelWorkbook(source, {}, {
      articles: [{ designation: 'Mobile', numero: '01' }, { designation: 'Fixe', numero: '02' }],
    }, { arrayMappings: [{ ...tableMapping, maxRows: undefined, columnMapping: { designation: 'A' }, composedColumns: [{ column: 'C', template: '{{designation}} {{numero}}' }] }] }));
    expect(result.getWorksheet('Offre')!.getCell('C4').value).toBe('Mobile 01');
    expect(result.getWorksheet('Offre')!.getCell('C5').value).toBe('Fixe 02');
    expect(result.getWorksheet('Offre')!.getCell('A6').value).toBe('Total');
  });

  it('rejette les colonnes composées invalides, les collisions et les formules protégées', async () => {
    const composedColumns = [{ column: 'C', template: '{{designation}} {{numero}}' }];
    const mapping = { ...tableMapping, composedColumns };
    expect(validateExcelMappings({ arrayMappings: [{ ...mapping, composedColumns: [{ column: 'A', template: composedColumns[0].template }] }] }, [{ name: 'Offre' }])).not.toEqual([]);
    expect(validateExcelMappings({ arrayMappings: [{ ...mapping, composedColumns: [{ column: 'C', template: '{{designation}}' }] }] }, [{ name: 'Offre' }])).not.toEqual([]);
    expect(validateExcelMappings({ arrayMappings: [{ ...mapping, composedColumns: [{ column: 'XFE', template: composedColumns[0].template }] }] }, [{ name: 'Offre' }])).not.toEqual([]);
    const source = await sourceWorkbook((_, sheet) => { sheet.getCell('C4').value = { formula: '1+1', result: 2 }; });
    await expect(fillExcelWorkbook(source, {}, { articles: [{ designation: 'Mobile', numero: '06' }] }, { arrayMappings: [mapping] })).rejects.toThrow('formule protégée');
    await expect(fillExcelWorkbook(await sourceWorkbook(), {}, { articles: [{ designation: ['Mobile'], numero: '06' }] }, { arrayMappings: [mapping] })).rejects.toThrow('champ simple');
  });

  it('étend les colonnes composées lors de l’insertion de lignes', async () => {
    const source = await sourceWorkbook((_, sheet) => { sheet.getCell('C5').value = 'Pied'; });
    const result = await loadResult(await fillExcelWorkbook(source, {}, {
      articles: [{ designation: 'Mobile', numero: '01' }, { designation: 'Fixe', numero: '02' }],
    }, {
      arrayMappings: [{ ...tableMapping, maxRows: 1, overflowMode: 'insert_rows', composedColumns: [{ column: 'C', template: '{{designation}}: {{numero}}' }] }],
    }));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('C4').value).toBe('Mobile: 01');
    expect(sheet.getCell('C5').value).toBe('Fixe: 02');
    expect(sheet.getCell('C6').value).toBe('Pied');
  });

  it('accepte les anciens mappings de cellules', async () => {
    const source = await sourceWorkbook();
    const result = await loadResult(await fillExcelWorkbook(source, { numero: '001' }, {}, { feuilleCiblee: 'Offre', cellMappings: { A1: 'numero', B1: 'numero' } }));
    expect(result.getWorksheet('Offre')!.getCell('A1').value).toBe('001');
    expect(result.getWorksheet('Offre')!.getCell('B1').value).toBe('001');
  });

  it('remplit les deux clés de numéro SA depuis les données préparées', async () => {
    const result = await loadResult(await fillExcelWorkbook(await sourceWorkbook(),
      { lignes: [{ designation: 'Mobile', numero_ligne: '' }] },
      { lignes: [{ designation: 'Mobile', numero_ligne: '0612345678' }] },
      { arrayMappings: [{ arrayId: 'lignes', sheetName: 'Offre', startRow: 4, maxRows: 2,
        stopCondition: 'empty_first_col', columnMapping: { numero: 'A', numero_ligne: 'B' } }] },
    ));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('A4').value).toBe('0612345678');
    expect(sheet.getCell('B4').value).toBe('0612345678');
  });

  it('résout aussi le numéro alias sur une ligne brute sans données préparées', async () => {
    const result = await loadResult(await fillExcelWorkbook(await sourceWorkbook(),
      { lignes: [{ numero_ligne: '0012345678' }, { numero: '0098765432' }] }, {},
      { arrayMappings: [{ arrayId: 'lignes', sheetName: 'Offre', startRow: 4, maxRows: 2,
        stopCondition: 'max_rows', columnMapping: { numero: 'A', numero_ligne: 'B' } }] },
    ));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('A4').value).toBe('0012345678'); expect(sheet.getCell('B4').value).toBe('0012345678');
    expect(sheet.getCell('A5').value).toBe('0098765432'); expect(sheet.getCell('B5').value).toBe('0098765432');
  });

  it('insère des images dans les cellules simples et les tableaux, avec un seul téléchargement', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const fetchMock = vi.fn().mockImplementation(async () => new Response(png));
    vi.stubGlobal('fetch', fetchMock);
    const source = await sourceWorkbook((_, sheet) => { sheet.getCell('D4').value = '{{%photo}}'; });
    const url = 'https://storage.example.test/photo.png';
    const result = await loadResult(await fillExcelWorkbook(source, {}, {
      entreprise_logo_image_url: url, articles: [{ designation: 'Produit', prix: 1, photo: url }],
    }, {
      sheetMappings: [{ sheetName: 'Offre', mapping: { entreprise_logo_image_url: 'A1' } }],
      arrayMappings: [{ ...tableMapping, maxRows: 1 }], imageWidth: 80, imageHeight: 40,
    }));
    expect(result.getWorksheet('Offre')!.getImages()).toHaveLength(2);
    expect(result.getWorksheet('Offre')!.getCell('A1').value).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('place l’image d’une colonne composée dans la cellule au lieu d’écrire son URL (WebP converti)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const { default: sharp } = await import('sharp');
    const webp = await sharp({ create: { width: 4, height: 2, channels: 3, background: '#f00' } }).webp().toBuffer();
    const fetchMock = vi.fn().mockImplementation(async () => new Response(new Uint8Array(webp)));
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://storage.example.test/box.webp';
    const result = await loadResult(await fillExcelWorkbook(await sourceWorkbook(), {}, {
      articles: [{ designation: 'Box Tv', image_url: url }, { designation: 'Sans image' }],
    }, {
      arrayMappings: [{ ...tableMapping, maxRows: 2, columnMapping: { prix: 'B' }, composedColumns: [{ column: 'A', template: '{{designation}} {{image_url}}' }] }],
    }));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('A4').value).toBe('Box Tv');
    expect(sheet.getCell('A5').value).toBe('Sans image');
    expect(sheet.getImages()).toHaveLength(1);
    expect(sheet.getImages()[0].range.tl.nativeRow).toBe(3);
    // Text is indented away from the border on every row of the column, with or without picture.
    expect([sheet.getCell('A4').alignment.indent, sheet.getCell('A5').alignment.indent]).toEqual([2, 2]);
  });

  it('place l’image d’une colonne composée à droite de la cellule fusionnée, centrée verticalement', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(png)));
    const source = await sourceWorkbook((_, sheet) => {
      sheet.getColumn(1).width = 80;
      sheet.mergeCells('A4:A5'); sheet.getRow(4).height = 60; sheet.getRow(5).height = 60;
    });
    const result = await loadResult(await fillExcelWorkbook(source, {}, {
      articles: [{ designation: 'Box Tv', image_url: 'https://storage.example.test/box.png' }],
    }, {
      arrayMappings: [{ ...tableMapping, maxRows: 1, columnMapping: { prix: 'C' }, composedColumns: [{ column: 'A', template: '{{designation}} {{image_url}}' }] }],
      imageWidth: 100, imageHeight: 100,
    }));
    const [image] = result.getWorksheet('Offre')!.getImages();
    // Column A is 565 px wide: a 100 px picture sits 100 px from its right edge (565 - 100 - 100 = 365 px).
    expect(image.range.tl.nativeCol).toBe(0);
    expect(image.range.tl.nativeColOff / 9525).toBeCloseTo(365, 0);
    // Merged height is 160 px: a 100 px picture starts 30 px below the top, in the first row (80 px).
    expect(image.range.tl.nativeRow).toBe(3);
    expect(image.range.tl.nativeRowOff / 9525).toBeCloseTo(30, 0);
  });

  it('conserve les retours à la ligne d’une colonne composée avec image', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(png)));
    const result = await loadResult(await fillExcelWorkbook(await sourceWorkbook(), {}, {
      articles: [{ designation: 'Box Tv', numero: 'Android TV 4K', image_url: 'https://storage.example.test/box.png' }],
    }, {
      arrayMappings: [{ ...tableMapping, maxRows: 1, columnMapping: { prix: 'B' }, composedColumns: [{ column: 'A', template: '{{designation}}\n{{numero}}\n{{image_url}}' }] }],
    }));
    const sheet = result.getWorksheet('Offre')!;
    expect(sheet.getCell('A4').value).toBe('Box Tv\nAndroid TV 4K');
    expect(sheet.getCell('A4').alignment.wrapText).toBe(true);
    expect(sheet.getImages()).toHaveLength(1);
  });

  it('refuse une URL image hors du stockage autorisé', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(fillExcelWorkbook(await sourceWorkbook(), {}, { entreprise_logo_image_url: 'http://127.0.0.1/logo.png' }, {
      sheetMappings: [{ sheetName: 'Offre', mapping: { entreprise_logo_image_url: 'A1' } }],
    })).rejects.toThrow('URL non autorisée');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retire les images d’exemple lorsque la valeur mappée est absente', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const source = await sourceWorkbook((workbook, sheet) => {
      const id = workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' });
      sheet.addImage(id, { tl: { row: 0, col: 0 }, ext: { width: 20, height: 20 } });
      sheet.addImage(id, { tl: { row: 0, col: 2 }, ext: { width: 20, height: 20 } });
    });
    const result = await loadResult(await fillExcelWorkbook(source, {}, {}, {
      sheetMappings: [{ sheetName: 'Offre', mapping: { entreprise_logo_image_url: 'A1' } }],
    }));
    const images = result.getWorksheet('Offre')!.getImages();
    expect(images).toHaveLength(1); expect(images[0].range.tl.nativeCol).toBe(2);
  });

  it('réécrit uniquement les références A1 et conserve les chaînes et références absolues copiées', () => {
    expect(rewriteExcelFormula('SUM(A5:A8)+"A5"+LOG10(A1)', 'Offre', 'Offre', 5, 2)).toBe('SUM(A7:A10)+"A5"+LOG10(A1)');
    expect(rewriteExcelFormula('A4+$B$1+$C4+D$2', 'Offre', 'Offre', 0, 1, true)).toBe('A5+$B$1+$C5+D$2');
    expect(rewriteExcelFormula("'Autre feuille'!A5+'Offre'!B5", 'Résumé', 'Offre', 5, 2)).toBe("'Autre feuille'!A5+'Offre'!B7");
  });
});
