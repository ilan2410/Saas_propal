// Générateur Excel - Modification directe du template
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { ExcelConfig } from '@/types';
import { fillExcelWorkbook } from './excel-workbook';
import { isAllowedFetchUrl } from '@/lib/security/validate-fetch-url';

/**
 * Remplit un template Excel en le dupliquant et en le modifiant
 * @param templateUrl - URL du template master
 * @param data - Données à injecter
 * @param fileConfig - Configuration du mapping
 * @param organizationId - ID de l'organisation
 * @returns URL du fichier généré
 */
export async function fillExcelTemplate(
  templateUrl: string,
  data: Record<string, unknown>,
  fileConfig: ExcelConfig,
  _organizationId: string
): Promise<string> {
  try {
    void _organizationId;
    const supabase = await createClient();

    // 1. Télécharger le template master
    if (!isAllowedFetchUrl(templateUrl)) throw new Error('URL du template non autorisée.');
    const response = await fetch(templateUrl, { redirect: 'error' });
    if (!response.ok) {
      throw new Error('Échec du téléchargement du template');
    }
    const templateBuffer = await response.arrayBuffer();

    const filledBuffer = await fillExcelWorkbook(templateBuffer, data, data, fileConfig as unknown as Record<string, unknown>);
    // 7. Upload vers Supabase Storage
    const fileName = `proposition-${Date.now()}.xlsx`;
    const { error } = await supabase.storage
      .from('propositions')
      .upload(fileName, filledBuffer, {
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      });

    if (error) throw error;

    // 8. Obtenir l'URL publique
    const {
      data: { publicUrl },
    } = supabase.storage.from('propositions').getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error('Erreur génération Excel:', error);
    throw new Error(
      `Échec de la génération Excel: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }
}

/**
 * Génère un preview HTML du template Excel rempli
 * @param templateUrl - URL du template
 * @param data - Données de test
 * @param fileConfig - Configuration
 * @returns HTML preview
 */
export async function generateExcelPreview(
  templateUrl: string,
  data: Record<string, unknown>,
  fileConfig: ExcelConfig
): Promise<string> {
  try {
    // Télécharger le template
    if (!isAllowedFetchUrl(templateUrl)) throw new Error('URL du template non autorisée.');
    const response = await fetch(templateUrl, { redirect: 'error' });
    const templateBuffer = await response.arrayBuffer();

    if (!response.ok) throw new Error('Impossible de charger le template Excel.');
    const filled = await fillExcelWorkbook(templateBuffer, data, data, fileConfig as unknown as Record<string, unknown>);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(filled.buffer.slice(filled.byteOffset, filled.byteOffset + filled.byteLength) as ArrayBuffer);
    const worksheet = workbook.getWorksheet(fileConfig.feuilleCiblee ?? fileConfig.sheetMappings?.[0]?.sheetName ?? 1);
    if (!worksheet) return '<p class="text-red-500">Feuille introuvable</p>';
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    // Générer un preview HTML (10 premières lignes)
    let html = '<table class="border-collapse border border-gray-300 text-sm">';
    let rowCount = 0;

    worksheet.eachRow((row) => {
      if (rowCount >= 10) return;

      html += '<tr>';
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > 10) return;

        // Vérifier si cette cellule sera remplie
        const willBeFilled = Object.keys(fileConfig.cellMappings ?? {}).includes(
          cell.address
        );
        const bgColor = willBeFilled ? 'bg-green-50' : '';

        html += `<td class="border border-gray-300 p-2 ${bgColor}">${escapeHtml(cell.text)}</td>`;
      });

      html += '</tr>';
      rowCount++;
    });

    html += '</table>';
    return html;
  } catch (error) {
    console.error('Erreur preview Excel:', error);
    return '<p class="text-red-500">Erreur lors de la génération du preview</p>';
  }
}
