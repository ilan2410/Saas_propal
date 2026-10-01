import { createServiceClient } from '@/lib/supabase/server';
import { isAllowedFetchUrl } from '@/lib/security/validate-fetch-url';
import { renderWordWithImages } from './word-image';
import { resolveDynamicWordVar } from './dynamic-vars';
import { buildPropositionBaseData, type GenerateOptions } from './base-data';
import { isPlainObject, setNestedValue, findValueInData, type UnknownRecord } from './data-utils';
import { formatValueForWord } from './word-data-utils';

/**
 * Génère un fichier Word (placeholder pour l'instant)
 */
export async function generateWordFile(options: GenerateOptions): Promise<string> {
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

  // Dictionnaire complet SA + SP + clauses + référence, partagé avec la génération Excel.
  // Ordre de priorité : base (flat SA < SA < SP < clauses < référence) < mapping utilisateur.
  const propositionBase = buildPropositionBaseData(options);
  const finalData = { ...propositionBase, ...mappedData };

  // Date de référence des variables dynamiques {{sp_date_limite_souscription[-N]}}.
  const propositionCreatedAt = options.proposition_created_at ?? new Date();

  let uint8Array: Uint8Array;
  try {
    // Rend le DOCX avec support des images, y compris à l'intérieur des boucles
    // de tableau (ex: {{#sp_materiel_detail}} ... {{%sp_matd_image_url}} ...).
    uint8Array = await renderWordWithImages(templateBuffer, finalData, {
      resolveMissingVar: (tag) => resolveDynamicWordVar(tag, { createdAt: propositionCreatedAt }),
      uppercaseVariables: fileConfig.forcerMajusculesVariables === true,
    });
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
