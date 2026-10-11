import { signedOrganizationStorageUrl } from '@/lib/security/storage-access';
import { fillExcelWorkbook } from './excel-workbook';
export { fillExcelWorkbook } from './excel-workbook';
import { createServiceClient } from '@/lib/supabase/server';
import { isAllowedFetchUrl } from '@/lib/security/validate-fetch-url';
import { buildExcelSourceData, buildPropositionBaseData, type GenerateOptions } from './base-data';
import { isPlainObject, findValueInData } from './data-utils';

/**
 * Génère un fichier Excel à partir du template
 */
export async function generateExcelFile(options: GenerateOptions): Promise<string> {
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
  const response = await fetch(await signedOrganizationStorageUrl(createServiceClient(), template.file_url, 'templates', organization_id), { redirect: 'error' });
  if (!response.ok) {
    console.error('❌ Erreur téléchargement template:', response.status, response.statusText);
    throw new Error(`Impossible de télécharger le template (${response.status}). Vérifiez que le fichier existe dans le storage.`);
  }

  const templateBuffer = await response.arrayBuffer();

  const fileConfig = isPlainObject(template.file_config) ? template.file_config : {};
  const excelDonnees = buildExcelSourceData(donnees, options.suggestions_sp_completes ?? null);
  const baseData = buildPropositionBaseData({ ...options, donnees: excelDonnees });
  const uint8Array = await fillExcelWorkbook(templateBuffer, excelDonnees, baseData, fileConfig, {
    createdAt: options.proposition_created_at,
  });
  // Upload vers Supabase Storage avec service role pour bypasser RLS
  const supabase = createServiceClient();

  // Extraire la raison sociale pour le nom du fichier
  let clientName = 'Proposition';

  // Chercher la raison sociale avec plusieurs fallbacks
  const raisonSociale = findValueInData(excelDonnees, 'raison_sociale') ||
                        findValueInData(excelDonnees, 'nom_commercial') ||
                        findValueInData(excelDonnees, 'client_nom') ||
                        excelDonnees['nom_client']; // Fallback sur le nom du client de la proposition

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
