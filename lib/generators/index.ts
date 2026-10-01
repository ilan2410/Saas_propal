/**
 * Module de génération de fichiers de proposition
 * Gère la création de fichiers Excel, Word et PDF à partir des templates
 */

import type { GenerateOptions } from './base-data';

export { buildPropositionBaseData } from './base-data';

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
      return (await import('./excel-proposition')).generateExcelFile(options);
    case 'word':
      return (await import('./word-proposition')).generateWordFile(options);
    case 'pdf':
      return generatePdfFile(options);
    default:
      throw new Error(`Type de fichier non supporté: ${template.file_type}`);
  }
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
