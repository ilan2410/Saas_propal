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
    const sheetMappings = [{ sheetName: 'Ancienne feuille', mapping: { 'client.nom': 'B2' } }];
    const arrayMappings = [tableMapping];
    const existing = { spVariablesCustom: [{ key: 'sp_test' }], preserverFormules: true,
      sheetMappings, arrayMappings, multiSheet: true, sheetCount: 1,
      feuilleCiblee: 'Ancienne feuille', cellMappings: { B2: 'client.nom' } };
    const retained = buildExcelReplacementConfig(existing, sheetMappings, arrayMappings, true);
    expect(retained).toMatchObject({ spVariablesCustom: existing.spVariablesCustom, preserverFormules: true,
      sheetMappings, arrayMappings, sheetCount: 1 });
    expect(validateExcelMappings(retained, [{ name: 'Autre feuille' }])).toContain('Feuille introuvable : Ancienne feuille.');
    const cleared = buildExcelReplacementConfig(existing, sheetMappings, arrayMappings, false);
    expect(cleared).toMatchObject({ spVariablesCustom: existing.spVariablesCustom, preserverFormules: true,
      sheetMappings: [], arrayMappings: [], sheetCount: 0 });
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
