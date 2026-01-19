// Parser Excel (.xlsx)
import ExcelJS from 'exceljs';

/**
 * Parse un fichier Excel et extrait les données
 * @param filePath - Chemin du fichier Excel
 * @returns Workbook ExcelJS
 */
export async function parseExcel(filePath: string): Promise<ExcelJS.Workbook> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    return workbook;
  } catch (error) {
    console.error('Erreur parsing Excel:', error);
    throw new Error(
      `Échec du parsing Excel: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }
}

/**
 * Récupère la liste des feuilles d'un fichier Excel
 * @param filePath - Chemin du fichier Excel
 * @returns Liste des noms de feuilles
 */
export async function getExcelSheets(filePath: string): Promise<string[]> {
  try {
    const workbook = await parseExcel(filePath);
    return workbook.worksheets.map((ws) => ws.name);
  } catch (error) {
    console.error('Erreur récupération feuilles Excel:', error);
    return [];
  }
}

/**
 * Parse un Excel et retourne un preview HTML de la première feuille
 * @param filePath - Chemin du fichier Excel
 * @param maxRows - Nombre maximum de lignes à afficher
 * @param maxCols - Nombre maximum de colonnes à afficher
 * @returns HTML preview
 */
export async function getExcelPreview(
  filePath: string,
  maxRows: number = 10,
  maxCols: number = 10
): Promise<string> {
  try {
    const workbook = await parseExcel(filePath);
    const firstSheet = workbook.worksheets[0];

    if (!firstSheet) {
      return '<p class="text-gray-500">Aucune feuille trouvée</p>';
    }

    let html = '<table class="border-collapse border border-gray-300 text-sm">';
    let rowCount = 0;

    firstSheet.eachRow((row, rowNumber) => {
      if (rowCount >= maxRows) return;

      html += '<tr>';
      let colCount = 0;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colCount >= maxCols) return;

        const value = cell.value?.toString() || '';
        const bgColor = rowNumber === 1 ? 'bg-gray-100' : '';
        html += `<td class="border border-gray-300 p-2 ${bgColor}">${value}</td>`;
        colCount++;
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

/**
 * Détecte les cellules avec formules dans une feuille Excel
 * @param filePath - Chemin du fichier Excel
 * @param sheetName - Nom de la feuille
 * @returns Liste des adresses de cellules avec formules
 */
export async function detectExcelFormulas(
  filePath: string,
  sheetName: string
): Promise<string[]> {
  try {
    const workbook = await parseExcel(filePath);
    const worksheet = workbook.getWorksheet(sheetName);

    if (!worksheet) {
      return [];
    }

    const formulaCells: string[] = [];

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.formula) {
          formulaCells.push(cell.address);
        }
      });
    });

    return formulaCells;
  } catch (error) {
    console.error('Erreur détection formules Excel:', error);
    return [];
  }
}

/**
 * Extrait les données d'une plage de cellules
 * @param filePath - Chemin du fichier Excel
 * @param sheetName - Nom de la feuille
 * @param range - Plage de cellules (ex: "A1:C10")
 * @returns Données extraites
 */
export async function extractExcelRange(
  filePath: string,
  sheetName: string,
  range: string
): Promise<any[][]> {
  try {
    const workbook = await parseExcel(filePath);
    const worksheet = workbook.getWorksheet(sheetName);

    if (!worksheet) {
      throw new Error(`Feuille "${sheetName}" introuvable`);
    }

    const data: any[][] = [];
    const cells = worksheet.getCell(range);

    // Note: Pour une vraie implémentation de range, il faudrait parser le range
    // Pour l'instant, on retourne juste la valeur de la cellule
    return [[cells.value]];
  } catch (error) {
    console.error('Erreur extraction range Excel:', error);
    return [];
  }
}

/**
 * Vérifie si un fichier est un Excel valide
 * @param filePath - Chemin du fichier
 * @returns true si valide
 */
export async function isValidExcel(filePath: string): Promise<boolean> {
  try {
    await parseExcel(filePath);
    return true;
  } catch {
    return false;
  }
}
