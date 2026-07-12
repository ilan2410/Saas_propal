/**
 * Module de génération de fichiers de proposition
 * Gère la création de fichiers Excel, Word et PDF à partir des templates
 */

import ExcelJS from 'exceljs';
import { createServiceClient } from '@/lib/supabase/server';
import { isAllowedFetchUrl } from '@/lib/security/validate-fetch-url';
import { renderWordWithImages } from './word-image';
import { buildSpWordData } from './sp-word-data';
import {
  isPlainObject,
  getNestedValue,
  setNestedValue,
  findValueInData,
  formatValueForWord,
  flattenForDocx,
  buildSaWordData,
  type UnknownRecord,
} from './word-data-utils';
import type { SuggestionsSpCompletes, WordConfig } from '@/types';

type SheetMapping = {
  sheetName: string;
  mapping: Record<string, string | string[]>;
};

type ArrayMapping = {
  arrayId: string;
  sheetName: string;
  startRow?: number;
  stopCondition?: 'empty_first_col' | 'max_rows';
  maxRows?: number;
  columnMapping?: Record<string, string>;
};

function parseSheetMappings(value: unknown): SheetMapping[] {
  if (!Array.isArray(value)) return [];

  const result: SheetMapping[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const sheetName = item.sheetName;
    const mapping = item.mapping;
    if (typeof sheetName !== 'string' || !isPlainObject(mapping)) continue;

    const nextMapping: Record<string, string | string[]> = {};
    for (const [fieldName, cellRefs] of Object.entries(mapping)) {
      if (typeof cellRefs === 'string') {
        nextMapping[fieldName] = cellRefs;
        continue;
      }
      if (
        Array.isArray(cellRefs) &&
        cellRefs.every((r) => typeof r === 'string')
      ) {
        nextMapping[fieldName] = cellRefs;
      }
    }

    result.push({ sheetName, mapping: nextMapping });
  }
  return result;
}

function parseArrayMappings(value: unknown): ArrayMapping[] {
  if (!Array.isArray(value)) return [];

  const result: ArrayMapping[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const arrayId = item.arrayId;
    const sheetName = item.sheetName;
    if (typeof arrayId !== 'string' || typeof sheetName !== 'string') continue;

    const startRow = typeof item.startRow === 'number' ? item.startRow : undefined;
    const stopCondition =
      item.stopCondition === 'empty_first_col' || item.stopCondition === 'max_rows'
        ? item.stopCondition
        : undefined;
    const maxRows = typeof item.maxRows === 'number' ? item.maxRows : undefined;

    const rawColumnMapping = item.columnMapping;
    const columnMapping: Record<string, string> = {};
    if (isPlainObject(rawColumnMapping)) {
      for (const [k, v] of Object.entries(rawColumnMapping)) {
        if (typeof v === 'string') columnMapping[k] = v;
      }
    }

    result.push({
      arrayId,
      sheetName,
      startRow,
      stopCondition: stopCondition ?? 'empty_first_col',
      maxRows,
      columnMapping,
    });
  }
  return result;
}

interface GenerateOptions {
  template: {
    id: string;
    file_type: 'excel' | 'word' | 'pdf';
    file_url: string;
    file_config: unknown;
    champs_actifs: string[];
  };
  donnees: UnknownRecord;
  organization_id: string;
  proposition_id: string;
  suggestions_sp_completes?: SuggestionsSpCompletes | null;
  /** Clauses conditionnelles déjà rendues : { sp_clause_<cle>: "texte" } */
  sp_clauses_rendered?: Record<string, string>;
  /** Référence proposition calculée → variable Word {{sp_reference}} (null si non configurée). */
  sp_reference?: string | null;
}

/**
 * Génère un fichier de proposition à partir d'un template et des données extraites
 */
export async function generatePropositionFile(options: GenerateOptions): Promise<string> {
  const { template, proposition_id } = options;

  console.log('🔧 Génération fichier:', {
    type: template.file_type,
    templateId: template.id,
    propositionId: proposition_id,
  });

  switch (template.file_type) {
    case 'excel':
      return generateExcelFile(options);
    case 'word':
      return generateWordFile(options);
    case 'pdf':
      return generatePdfFile(options);
    default:
      throw new Error(`Type de fichier non supporté: ${template.file_type}`);
  }
}

/**
 * Génère un fichier Excel à partir du template
 */
async function generateExcelFile(options: GenerateOptions): Promise<string> {
  const { template, donnees, organization_id } = options;

  console.log('📊 Génération Excel...');
  console.log('📁 URL du template:', template.file_url);

  // Vérifier que l'URL du template existe
  if (!template.file_url) {
    throw new Error('URL du template manquante. Le fichier template n\'a pas été uploadé correctement.');
  }

  if (!isAllowedFetchUrl(template.file_url)) {
    throw new Error('URL du template non autorisée.');
  }

  // Télécharger le template Excel
  const response = await fetch(template.file_url);
  if (!response.ok) {
    console.error('❌ Erreur téléchargement template:', response.status, response.statusText);
    throw new Error(`Impossible de télécharger le template (${response.status}). Vérifiez que le fichier existe dans le storage.`);
  }

  const templateBuffer = await response.arrayBuffer();

  // Charger le workbook avec gestion d'erreur
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(templateBuffer);
  } catch (error) {
    console.error('❌ Erreur chargement template Excel:', error);
    throw new Error(`Le fichier template Excel est corrompu ou invalide: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }

  const fileConfig = isPlainObject(template.file_config) ? template.file_config : {};
  const sheetMappings = parseSheetMappings(fileConfig.sheetMappings);

  console.log(`📋 Configuration du mapping:`, JSON.stringify(fileConfig, null, 2));
  console.log(`📊 Données à insérer:`, JSON.stringify(donnees, null, 2));
  console.log(`📋 ${sheetMappings.length} feuille(s) à remplir`);

  // Lister les feuilles disponibles dans le workbook
  const availableSheets = workbook.worksheets.map(ws => ws.name);
  console.log(`📑 Feuilles disponibles dans le fichier:`, availableSheets);

  // Remplir chaque feuille selon le mapping
  for (const sheetMapping of sheetMappings) {
    console.log(`🔍 Recherche feuille: "${sheetMapping.sheetName}"`);
    const worksheet = workbook.getWorksheet(sheetMapping.sheetName);
    if (!worksheet) {
      console.warn(`⚠️ Feuille "${sheetMapping.sheetName}" non trouvée dans le fichier`);
      continue;
    }

    console.log(`📝 Remplissage feuille: ${sheetMapping.sheetName}`);

    // Remplir les cellules mappées
    const mapping = sheetMapping.mapping || {};
    console.log(`🗺️ Mapping de la feuille:`, JSON.stringify(mapping, null, 2));
    
    for (const [fieldName, cellRefs] of Object.entries(mapping)) {
      // Utiliser la fonction de recherche intelligente
      const value = findValueInData(donnees, fieldName);
      console.log(`  🔎 Champ "${fieldName}": valeur = ${value !== undefined ? JSON.stringify(value).substring(0, 100) : 'UNDEFINED'}`);
      if (value === undefined || value === null || value === '') {
        console.log(`  ⏭️ Champ "${fieldName}" ignoré (valeur vide)`);
        continue;
      }

      // cellRefs peut être une string ou un array
      const refs = Array.isArray(cellRefs) ? cellRefs : [cellRefs];
      
      for (const cellRef of refs) {
        try {
          const cell = worksheet.getCell(cellRef as string);
          cell.value = formatValueForExcel(value);
          console.log(`  ✓ ${fieldName} → ${cellRef}: ${value}`);
        } catch (error) {
          console.error(`  ✗ Erreur cellule ${cellRef}:`, error);
        }
      }
    }
  }

  // Remplir les tableaux (array mappings)
  const arrayMappings = parseArrayMappings(fileConfig.arrayMappings);
  for (const arrayMapping of arrayMappings) {
    const worksheet = workbook.getWorksheet(arrayMapping.sheetName);
    if (!worksheet) {
      console.warn(`⚠️ Feuille tableau "${arrayMapping.sheetName}" non trouvée`);
      continue;
    }

    // Chercher les données du tableau avec la fonction intelligente
    let arrayData: unknown = findValueInData(donnees, arrayMapping.arrayId);
    
    // Mapping spécifique pour les tableaux courants
    if (!Array.isArray(arrayData)) {
      const arrayMappingsLookup: Record<string, string> = {
        'lignes_fixes': 'lignes.fixes',
        'lignes_mobiles': 'lignes.mobiles',
        'lignes_internet': 'lignes.internet',
        'location_materiel': 'location_materiel',
        'forfaits_fixes': 'abonnements.forfaits_fixes',
        'forfaits_mobiles': 'abonnements.forfaits_mobiles',
        'services': 'services',
        'equipements': 'equipements',
        'reductions': 'reductions',
        'internet': 'abonnements.internet',
      };
      
      const path = arrayMappingsLookup[arrayMapping.arrayId];
      if (path) {
        arrayData = getNestedValue(donnees, path);
      }
    }
    
    if (!Array.isArray(arrayData)) {
      console.warn(`⚠️ Données tableau "${arrayMapping.arrayId}" non trouvées ou pas un tableau`);
      continue;
    }

    console.log(`📋 Remplissage tableau: ${arrayMapping.arrayId} (${arrayData.length} lignes)`);

    const startRow = arrayMapping.startRow || 2;
    const columnMapping = arrayMapping.columnMapping || {};

    arrayData.forEach((item: unknown, index: number) => {
      const rowNumber = startRow + index;
      console.log(`  📝 Ligne ${rowNumber}:`, JSON.stringify(item).substring(0, 100));
      
      if (!isPlainObject(item)) return;
      for (const [fieldId, column] of Object.entries(columnMapping)) {
        const value = item[fieldId];
        if (value === undefined || value === null) continue;

        try {
          const cellRef = `${column}${rowNumber}`;
          const cell = worksheet.getCell(cellRef);
          cell.value = formatValueForExcel(value);
          console.log(`    ✓ ${fieldId} → ${cellRef}: ${value}`);
        } catch (error) {
          console.error(`  ✗ Erreur tableau ${arrayMapping.arrayId}:`, error);
        }
      }
    });
  }

  // Générer le buffer du fichier avec gestion d'erreur
  let buffer: ArrayBuffer;
  try {
    buffer = await workbook.xlsx.writeBuffer();
  } catch (error) {
    console.error('❌ Erreur génération buffer Excel:', error);
    throw new Error(`Impossible de générer le fichier Excel: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }
  
  // Convertir le buffer en Uint8Array pour assurer la compatibilité
  const uint8Array = new Uint8Array(buffer);
  
  // Vérifier que le buffer n'est pas vide
  if (uint8Array.byteLength === 0) {
    throw new Error('Le fichier Excel généré est vide');
  }

  // Upload vers Supabase Storage avec service role pour bypasser RLS
  const supabase = createServiceClient();
  
  // Extraire la raison sociale pour le nom du fichier
  let clientName = 'Proposition';
  
  // Chercher la raison sociale avec plusieurs fallbacks
  const raisonSociale = findValueInData(donnees, 'raison_sociale') || 
                        findValueInData(donnees, 'nom_commercial') ||
                        findValueInData(donnees, 'client_nom') ||
                        donnees['nom_client']; // Fallback sur le nom du client de la proposition
  
  if (raisonSociale && typeof raisonSociale === 'string' && raisonSociale.trim()) {
    // Nettoyer le nom : enlever les caractères spéciaux et limiter la longueur
    clientName = raisonSociale
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Enlever les caractères spéciaux
      .trim()
      .substring(0, 50) // Limiter à 50 caractères
      .replace(/\s+/g, '_'); // Remplacer les espaces par des underscores
  }
  
  const fileName = `Propal_${clientName}_${Date.now()}.xlsx`;
  const filePath = `generated/${organization_id}/${fileName}`;

  console.log('📤 Upload vers:', filePath);
  console.log('📊 Taille du fichier:', uint8Array.byteLength, 'bytes');

  const { error: uploadError } = await supabase.storage
    .from('templates')
    .upload(filePath, uint8Array, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
      // Ajouter des headers pour éviter la corruption
      cacheControl: '3600',
    });

  if (uploadError) {
    console.error('❌ Erreur upload:', uploadError);
    throw new Error(`Erreur upload: ${uploadError.message}`);
  }

  // Vérifier que le fichier a bien été uploadé
  const { data: fileList, error: listError } = await supabase.storage
    .from('templates')
    .list(`generated/${organization_id}`, {
      limit: 1,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (listError || !fileList || fileList.length === 0) {
    console.warn('⚠️ Impossible de vérifier l\'upload du fichier');
  } else {
    console.log('✅ Fichier uploadé avec succès:', fileList[0].name);
  }

  // Obtenir l'URL publique
  const { data: urlData } = supabase.storage
    .from('templates')
    .getPublicUrl(filePath);

  console.log('✅ Fichier Excel généré:', urlData.publicUrl);

  return urlData.publicUrl;
}

/**
 * Génère un fichier Word (placeholder pour l'instant)
 */
async function generateWordFile(options: GenerateOptions): Promise<string> {
  const { template, donnees, organization_id } = options;

  if (!template.file_url) {
    throw new Error('URL du template manquante. Le fichier template n\'a pas été uploadé correctement.');
  }

  if (!isAllowedFetchUrl(template.file_url)) {
    throw new Error('URL du template non autorisée.');
  }

  const response = await fetch(template.file_url);
  if (!response.ok) {
    throw new Error(`Impossible de télécharger le template (${response.status}). Vérifiez que le fichier existe dans le storage.`);
  }

  const templateBuffer = await response.arrayBuffer();

  const fileConfig = isPlainObject(template.file_config) ? template.file_config : {};
  const baseData: UnknownRecord = isPlainObject(donnees) ? donnees : {};
  const mappedData: UnknownRecord = { ...baseData };

  const rawFieldMappings = fileConfig.fieldMappings;
  const fieldMappings: Record<string, string> = {};
  if (isPlainObject(rawFieldMappings)) {
    for (const [k, v] of Object.entries(rawFieldMappings)) {
      if (typeof v === 'string') fieldMappings[k] = v;
    }
  }

  for (const [templateVar, dataKey] of Object.entries(fieldMappings)) {
    const cleanVar = templateVar.replace(/[{}]/g, '').trim();
    if (!cleanVar) continue;

    const value = findValueInData(baseData, dataKey);
    const formatted = formatValueForWord(value);

    if (cleanVar.includes('.')) {
      setNestedValue(mappedData, cleanVar, formatted);
    } else {
      mappedData[cleanVar] = formatted;
    }
  }

  // Aplatir les donnees pour Docxtemplater.
  // Docxtemplater resout {{client.nom}} via la cle plate "client.nom",
  // pas via l'objet imbrique.
  const flatData: UnknownRecord = {};
  flattenForDocx(baseData, flatData);

  // Injecter les données SP (les clés SA ont la priorité sur SP)
  const spCompletes = (options.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null;
  const wordCfg = (isPlainObject(fileConfig) ? fileConfig : {}) as unknown as WordConfig;
  const spData = buildSpWordData(spCompletes, wordCfg.spTableauxFusionnes);
  // Tableaux SA remontés à plat (ex: {{#lignes}}) — priment sur les clés plates SA.
  const saData = buildSaWordData(baseData);
  // Clauses conditionnelles rendues (texte libre, NON soumis au title-case).
  const clausesData = options.sp_clauses_rendered ?? {};
  // Référence proposition → {{sp_reference}} (chaîne vide si non configurée pour que la balise se résolve).
  const referenceData: Record<string, string> = { sp_reference: options.sp_reference ?? '' };
  // Ordre de priorité : données extraites (flat) < SA < SP calculées < clauses < référence < mapping utilisateur.
  const finalData = { ...flatData, ...saData, ...spData, ...clausesData, ...referenceData, ...mappedData };

  let uint8Array: Uint8Array;
  try {
    // Rend le DOCX avec support des images, y compris à l'intérieur des boucles
    // de tableau (ex: {{#sp_materiel_detail}} ... {{%sp_matd_image_url}} ...).
    uint8Array = await renderWordWithImages(templateBuffer, finalData);
  } catch (error) {
    const e = error as unknown as { message?: string; properties?: { errors?: Array<{ properties?: { explanation?: string } }> } };
    const details =
      e?.properties?.errors?.map((er) => er?.properties?.explanation).filter(Boolean).join('\n') ||
      e?.message ||
      'Erreur inconnue';
    throw new Error(`Erreur Docxtemplater: ${details}`);
  }

  if (uint8Array.byteLength === 0) {
    throw new Error('Le fichier Word généré est vide');
  }

  const supabase = createServiceClient();

  let clientName = 'Proposition';
  const raisonSociale =
    findValueInData(baseData, 'raison_sociale') ||
    findValueInData(baseData, 'nom_commercial') ||
    findValueInData(baseData, 'client_nom') ||
    baseData['nom_client'];

  if (raisonSociale && typeof raisonSociale === 'string' && raisonSociale.trim()) {
    clientName = raisonSociale
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .substring(0, 50)
      .replace(/\s+/g, '_');
  }

  const fileName = `Propal_${clientName}_${Date.now()}.docx`;
  const filePath = `generated/${organization_id}/${fileName}`;

  const { error: uploadError } = await supabase.storage.from('templates').upload(filePath, uint8Array, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: true,
    cacheControl: '3600',
  });

  if (uploadError) {
    throw new Error(`Erreur upload: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from('templates').getPublicUrl(filePath);
  return urlData.publicUrl;
}

/**
 * Génère un fichier PDF (placeholder pour l'instant)
 */
async function generatePdfFile(options: GenerateOptions): Promise<string> {
  void options;
  // TODO: Implémenter la génération PDF
  console.log('📑 Génération PDF (non implémenté)');
  throw new Error('La génération de fichiers PDF n\'est pas encore implémentée');
}

/**
 * Formate une valeur pour l'insertion dans Excel
 */
function formatValueForExcel(value: unknown): string | number | Date {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'object') {
    // Si c'est un objet, le convertir en string JSON lisible
    return JSON.stringify(value);
  }
  
  // Essayer de convertir en nombre si c'est une string numérique
  if (typeof value === 'string') {
    const numValue = parseFloat(value.replace(/[€$,\s]/g, '').replace(',', '.'));
    if (!isNaN(numValue) && value.match(/^[\d\s€$,.]+$/)) {
      return numValue;
    }
  }
  
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}
