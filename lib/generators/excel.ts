// Générateur Excel - Modification directe du template
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { ExcelConfig } from '@/types';

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
    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error('Échec du téléchargement du template');
    }
    const templateBuffer = await response.arrayBuffer();

    // 2. Charger le workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer);

    // 3. Sélectionner la feuille cible
    const worksheet = workbook.getWorksheet(fileConfig.feuilleCiblee);

    if (!worksheet) {
      throw new Error(`Feuille "${fileConfig.feuilleCiblee}" introuvable`);
    }

    // 4. Remplir les cellules selon le mapping (MODIFICATION DIRECTE)
    for (const [cellAddress, dataKey] of Object.entries(
      fileConfig.cellMappings
    )) {
      // Skip les cellules avec formules à préserver
      if (fileConfig.cellulesAvecFormules?.includes(cellAddress)) {
        continue;
      }

      const cell = worksheet.getCell(cellAddress);

      // Préserver le style de la cellule
      const originalStyle = { ...cell.style };
      const originalNumFmt = cell.numFmt;

      // Injecter la valeur
      const value = data[dataKey];

      // Gérer les types de données
      if (value === null || value === undefined) {
        cell.value = '';
      } else if (typeof value === 'number') {
        cell.value = value;
      } else if (value instanceof Date) {
        cell.value = value;
      } else {
        cell.value = value.toString();
      }

      // Réappliquer le style ET le format numérique
      cell.style = originalStyle;
      if (originalNumFmt) {
        cell.numFmt = originalNumFmt; // Ex: '#,##0.00 €' pour les montants
      }
    }

    // 5. Forcer le recalcul des formules
    if (fileConfig.preserverFormules !== false) {
      workbook.calcProperties = {
        fullCalcOnLoad: true,
      };
    }

    // 6. Générer le buffer du fichier modifié
    const filledBuffer = await workbook.xlsx.writeBuffer();

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
    const response = await fetch(templateUrl);
    const templateBuffer = await response.arrayBuffer();

    // Charger le workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer);

    const worksheet = workbook.getWorksheet(fileConfig.feuilleCiblee);
    if (!worksheet) {
      return '<p class="text-red-500">Feuille introuvable</p>';
    }

    // Générer un preview HTML (10 premières lignes)
    let html = '<table class="border-collapse border border-gray-300 text-sm">';
    let rowCount = 0;

    worksheet.eachRow((row) => {
      if (rowCount >= 10) return;

      html += '<tr>';
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > 10) return;

        // Vérifier si cette cellule sera remplie
        const willBeFilled = Object.keys(fileConfig.cellMappings).includes(
          cell.address
        );
        const bgColor = willBeFilled ? 'bg-green-50' : '';

        const filledValue = willBeFilled
          ? data[fileConfig.cellMappings[cell.address]]
          : undefined;
        const value =
          filledValue === undefined || filledValue === null ? cell.value : filledValue;

        html += `<td class="border border-gray-300 p-2 ${bgColor}">${value === undefined || value === null ? '' : String(value)}</td>`;
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
