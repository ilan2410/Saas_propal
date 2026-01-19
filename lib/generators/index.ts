/**
 * Module de génération de fichiers de proposition
 * Gère la création de fichiers Excel, Word et PDF à partir des templates
 */

import ExcelJS from 'exceljs';
import { createServiceClient } from '@/lib/supabase/server';

interface GenerateOptions {
  template: {
    id: string;
    file_type: 'excel' | 'word' | 'pdf';
    file_url: string;
    file_config: any;
    champs_actifs: string[];
  };
  donnees: Record<string, any>;
  organization_id: string;
  proposition_id: string;
}

/**
 * Génère un fichier de proposition à partir d'un template et des données extraites
 */
export async function generatePropositionFile(options: GenerateOptions): Promise<string> {
  const { template, donnees, organization_id, proposition_id } = options;

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
  const { template, donnees, organization_id, proposition_id } = options;

  console.log('📊 Génération Excel...');
  console.log('📁 URL du template:', template.file_url);

  // Vérifier que l'URL du template existe
  if (!template.file_url) {
    throw new Error('URL du template manquante. Le fichier template n\'a pas été uploadé correctement.');
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

  const fileConfig = template.file_config || {};
  const sheetMappings = fileConfig.sheetMappings || [];

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
  const arrayMappings = fileConfig.arrayMappings || [];
  for (const arrayMapping of arrayMappings) {
    const worksheet = workbook.getWorksheet(arrayMapping.sheetName);
    if (!worksheet) {
      console.warn(`⚠️ Feuille tableau "${arrayMapping.sheetName}" non trouvée`);
      continue;
    }

    // Chercher les données du tableau avec la fonction intelligente
    let arrayData = findValueInData(donnees, arrayMapping.arrayId);
    
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

    arrayData.forEach((item: any, index: number) => {
      const rowNumber = startRow + index;
      console.log(`  📝 Ligne ${rowNumber}:`, JSON.stringify(item).substring(0, 100));
      
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
                        donnees.nom_client; // Fallback sur le nom du client de la proposition
  
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
  // TODO: Implémenter la génération Word avec docx ou similar
  console.log('📄 Génération Word (non implémenté)');
  throw new Error('La génération de fichiers Word n\'est pas encore implémentée');
}

/**
 * Génère un fichier PDF (placeholder pour l'instant)
 */
async function generatePdfFile(options: GenerateOptions): Promise<string> {
  // TODO: Implémenter la génération PDF
  console.log('📑 Génération PDF (non implémenté)');
  throw new Error('La génération de fichiers PDF n\'est pas encore implémentée');
}

/**
 * Cherche une valeur dans un objet imbriqué en utilisant différentes stratégies
 * Ex: "contact_nom" peut correspondre à donnees.client.contacts[0].nom ou donnees.contact_nom
 */
function findValueInData(donnees: Record<string, any>, fieldName: string): any {
  // 1. Chercher directement à la racine
  if (donnees[fieldName] !== undefined && donnees[fieldName] !== null) {
    return donnees[fieldName];
  }

  // 2. Chercher avec le chemin tel quel (notation pointée)
  const directPathValue = getNestedValue(donnees, fieldName);
  if (directPathValue !== undefined && directPathValue !== null) {
    return directPathValue;
  }

  // 3. Fallback: underscore -> dot (ex: contact_nom -> client.nom)
  const dotNotation = fieldName.replace(/_/g, '.');
  if (dotNotation !== fieldName) {
    const dotValue = getNestedValue(donnees, dotNotation);
    if (dotValue !== undefined && dotValue !== null) {
      return dotValue;
    }
  }

  // 4. Mapping spécifique pour les champs courants (ordre de priorité important)
  const fieldMappings: Record<string, string[]> = {
    'nom': ['client.nom'],
    'prenom': ['client.prenom'],
    'email': ['client.email'],
    'fonction': ['client.fonction'],
    'mobile': ['client.mobile', 'client.telephone'],
    'fixe': ['client.fixe'],
    'telephone': ['client.telephone', 'client.mobile', 'client.fixe'],

    // Contact client (PAS le fournisseur!)
    'contact_nom': ['client.nom', 'client.contact.nom', 'client.contacts.0.nom'],
    'contact_prenom': ['client.prenom', 'client.contact.prenom', 'client.contacts.0.prenom'],
    'contact_email': ['client.email', 'client.contact.email', 'client.contacts.0.email'],
    'contact_telephone': ['client.telephone', 'client.contact.telephone', 'client.contacts.0.telephone'],
    'contact_mobile': ['client.mobile', 'client.contact.mobile', 'client.contacts.0.mobile', 'client.telephone'],
    'contact_fixe': ['client.fixe', 'client.contact.fixe', 'client.contacts.0.fixe'],
    'contact_fonction': ['client.fonction', 'client.contact.fonction', 'client.contacts.0.fonction'],
    
    // Client
    'client_nom': ['client.raison_sociale', 'client.nom_commercial', 'client.nom'],
    'raison_sociale': ['client.raison_sociale'],
    'nom_commercial': ['client.nom_commercial'],
    'siren': ['client.siren'],
    'siret': ['client.siret'],
    'adresse': ['client.adresse', 'client.adresse.rue'],
    'adresse_complete': ['client.adresse', 'client.adresse.rue'],
    'code_postal': ['client.code_postal', 'client.adresse.code_postal'],
    'ville': ['client.ville', 'client.adresse.ville'],
    'pays': ['client.pays', 'client.adresse.pays'],
    'ape': ['client.ape'],
    'capital': ['client.capital'],
    'forme_juridique': ['client.forme_juridique'],
    'rcs': ['client.rcs'],
    
    // Fournisseur / Opérateur (séparé du contact!)
    'operateur_nom': ['fournisseur.nom', 'fournisseur'],
    'fournisseur_nom': ['fournisseur.nom', 'fournisseur'],
    'operateur_adresse': ['fournisseur.adresse'],
    'operateur_siret': ['fournisseur.siret'],
    'code_client': ['fournisseur.code_client'],
    'contact_support': ['fournisseur.contact_support'],
    
    // Facturation
    'total_ht': ['facturation.total_ht'],
    'total_ttc': ['facturation.total_ttc'],
    'total_tva': ['facturation.total_tva'],
    'numero_facture': ['facturation.numero_facture'],
    'date_facture': ['facturation.date_facture'],
    'date_echeance': ['facturation.date_echeance'],
    'periode_facturee': ['facturation.periode_facturee'],
    'mode_paiement': ['facturation.mode_paiement'],
    'iban': ['facturation.iban'],
    
    // Totaux par catégorie
    'abonnements_ht': ['facturation.abonnements_ht'],
    'services_ht': ['facturation.services_ht'],
    'reductions_ht': ['facturation.reductions_ht'],
    'consommations_ht': ['facturation.consommations_ht'],
    
    // Lignes
    'lignes_fixes': ['lignes.fixes'],
    'lignes_mobiles': ['lignes.mobiles'],
    'total_lignes_fixes': ['lignes.total_lignes_fixes'],
    'total_lignes_mobiles': ['lignes.total_lignes_mobiles'],
  };

  const paths = fieldMappings[fieldName];
  if (paths) {
    for (const path of paths) {
      const value = getNestedValue(donnees, path);
      // Vérifier que la valeur existe ET n'est pas un tableau vide
      if (value !== undefined && value !== null && 
          !(Array.isArray(value) && value.length === 0)) {
        return value;
      }
    }
  }

  // 4. NE PAS faire de recherche récursive pour éviter les faux positifs
  // (ex: trouver "nom" du fournisseur au lieu du contact)
  
  return undefined;
}

/**
 * Récupère une valeur imbriquée avec un chemin en notation pointée
 * Ex: getNestedValue(obj, 'client.adresse.ville')
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    
    // Gérer les index de tableau (ex: "contacts.0.nom")
    if (/^\d+$/.test(part)) {
      current = current[parseInt(part)];
    } else {
      current = current[part];
    }
  }
  
  return current;
}

/**
 * Recherche récursive d'une clé dans un objet
 */
function searchInObject(obj: any, key: string, maxDepth: number = 3): any {
  if (maxDepth <= 0 || obj === null || obj === undefined) return undefined;
  if (typeof obj !== 'object') return undefined;

  // Chercher la clé directement
  if (obj[key] !== undefined) return obj[key];

  // Chercher dans les sous-objets
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      const found = searchInObject(obj[k], key, maxDepth - 1);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}

/**
 * Formate une valeur pour l'insertion dans Excel
 */
function formatValueForExcel(value: any): string | number | Date {
  if (value === null || value === undefined) {
    return '';
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
  
  return value;
}
